/**
 * 版本更新控制器
 * 提供版本检查和智能更新功能
 * 
 * 版本获取策略：
 * 1. 当前版本：从 package.json 读取
 * 2. 最新版本：从 GitHub API 获取最新 tag
 * 3. 更新方式：通过 git pull 拉取代码
 */

import { Router, Response } from 'express'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { requireAuth, requireRoot } from '../middleware/auth'
import { createLogger } from '../services/logger'
import type { AuthedRequest } from '../types/auth'

const execAsync = promisify(exec)
const logger = createLogger('update')
const router = Router()

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 项目根目录
const ROOT_DIR = path.resolve(__dirname, '../../..')

// GitHub 仓库信息
const GITHUB_OWNER = 'LZZLHY'
const GITHUB_REPO = 'start'

// 版本信息接口
interface VersionInfo {
  current: string
  currentPatch: number
  latest: string
  latestPatch: number
  hasUpdate: boolean
  releaseNotes: string
  releaseDate: string
  needsRestart: boolean
  needsDeps: boolean
  needsMigration: boolean
  frontendOnly: boolean
  hasGit: boolean
}

/**
 * 获取当前版本（从 package.json 读取）
 */
function getCurrentVersion(): { version: string; patch: number } {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return {
      version: pkg.version || 'unknown',
      patch: pkg.patchVersion || 0
    }
  } catch {
    return { version: 'unknown', patch: 0 }
  }
}

/**
 * 检查是否有 git
 */
async function hasGit(): Promise<boolean> {
  try {
    await execAsync('git --version')
    // 还要检查当前目录是否是 git 仓库
    await execAsync('git rev-parse --git-dir', { cwd: ROOT_DIR })
    return true
  } catch {
    return false
  }
}

/**
 * 从 GitHub API 获取最新版本信息
 */
async function getLatestRelease(): Promise<{ version: string; patch: number; notes: string; date: string } | null> {
  try {
    // 使用 GitHub API 获取最新 tag
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Start-App'
        }
      }
    )
    
    if (!response.ok) {
      logger.warn('GitHub API 请求失败', { status: response.status })
      return null
    }
    
    const tags = await response.json() as Array<{ name: string }>
    if (!tags || tags.length === 0) {
      return null
    }
    
    // 获取最新 tag（按版本号排序）
    const latestTag = tags[0].name
    const version = latestTag.replace(/^v/, '') // 移除 v 前缀
    
    // 获取 package.json 中的 patchVersion
    let patch = 0
    try {
      const pkgResp = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${latestTag}/package.json`,
        {
          headers: {
            'User-Agent': 'Start-App'
          }
        }
      )
      if (pkgResp.ok) {
        const pkg = await pkgResp.json() as { patchVersion?: number }
        patch = pkg.patchVersion || 0
      }
    } catch {
      // 忽略 patchVersion 获取失败
    }
    
    // 尝试获取 release notes
    let notes = ''
    let date = ''
    try {
      const releaseResp = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${latestTag}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Start-App'
          }
        }
      )
      if (releaseResp.ok) {
        const release = await releaseResp.json() as { body?: string; published_at?: string }
        notes = release.body || ''
        date = release.published_at || ''
      }
    } catch {
      // 忽略 release notes 获取失败
    }
    
    return { version, patch, notes, date }
  } catch (error) {
    logger.error('获取最新版本失败', { error })
    return null
  }
}

/**
 * 比较两个版本之间的变更文件
 * 通过 GitHub API 获取变更文件列表，判断是否需要安装依赖或重启后端
 */
async function getChangedFiles(currentVersion: string, latestVersion: string): Promise<{
  needsDeps: boolean
  needsRestart: boolean
  needsMigration: boolean
  frontendOnly: boolean
  changedFiles: string[]
}> {
  const result = {
    needsDeps: false,
    needsRestart: false,
    needsMigration: false,
    frontendOnly: false,
    changedFiles: [] as string[]
  }
  
  try {
    // 使用 GitHub Compare API 获取两个版本之间的差异
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/v${currentVersion}...v${latestVersion}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Start-App'
        }
      }
    )
    
    if (!response.ok) {
      logger.warn('GitHub Compare API 请求失败，使用保守策略', { status: response.status })
      // API 失败时使用保守策略
      return { needsDeps: true, needsRestart: true, needsMigration: true, frontendOnly: false, changedFiles: [] }
    }
    
    const data = await response.json() as { files?: Array<{ filename: string }> }
    const files = data.files || []
    result.changedFiles = files.map(f => f.filename)
    
    // 统计变更类型
    let hasBackendChanges = false
    let hasFrontendChanges = false
    
    // 分析变更文件
    for (const file of result.changedFiles) {
      // 检查是否需要安装依赖（package.json 或 package-lock.json 变更）
      if (file === 'backend/package.json' || 
          file === 'backend/package-lock.json' ||
          file === 'frontend/package.json' ||
          file === 'frontend/package-lock.json' ||
          file === 'package.json' ||
          file === 'package-lock.json') {
        result.needsDeps = true
      }
      
      // 检查是否需要数据库迁移（prisma 目录下的文件变更）
      if (file.startsWith('backend/prisma/') && 
          (file.endsWith('.prisma') || file.includes('/migrations/'))) {
        result.needsMigration = true
      }
      
      // 检查是否需要重启后端（backend 目录下的代码变更）
      if (file.startsWith('backend/') && 
          !file.endsWith('.md') && 
          !file.endsWith('.txt')) {
        result.needsRestart = true
        hasBackendChanges = true
      }
      
      // 检查是否有前端变更
      if (file.startsWith('frontend/') && 
          !file.endsWith('.md') && 
          !file.endsWith('.txt')) {
        hasFrontendChanges = true
      }
    }
    
    // 判断是否仅前端更新（最快速的更新方式）
    result.frontendOnly = hasFrontendChanges && !hasBackendChanges && !result.needsDeps && !result.needsMigration
    
    logger.info('版本差异分析完成', {
      currentVersion,
      latestVersion,
      totalFiles: result.changedFiles.length,
      needsDeps: result.needsDeps,
      needsRestart: result.needsRestart,
      needsMigration: result.needsMigration,
      frontendOnly: result.frontendOnly
    })
    
    return result
  } catch (error) {
    logger.error('获取版本差异失败，使用保守策略', { error })
    // 出错时使用保守策略
    return { needsDeps: true, needsRestart: true, needsMigration: true, frontendOnly: false, changedFiles: [] }
  }
}

/**
 * 比较版本号
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * GET /api/admin/update/check - 检查更新
 */
router.get('/check', requireAuth, requireRoot, async (_req: AuthedRequest, res: Response) => {
  try {
    const currentInfo = getCurrentVersion()
    const gitAvailable = await hasGit()
    const latestInfo = await getLatestRelease()
    
    const latest = latestInfo?.version || currentInfo.version
    const latestPatch = latestInfo?.patch || 0
    
    // 比较版本：先比较大版本号，再比较补丁号
    const versionCompare = compareVersions(latest, currentInfo.version)
    const hasUpdate = versionCompare > 0 || (versionCompare === 0 && latestPatch > currentInfo.patch)
    
    // 智能检测是否需要安装依赖和重启
    let needsDeps = false
    let needsRestart = false
    let needsMigration = false
    let frontendOnly = false
    
    if (hasUpdate) {
      // 通过 GitHub API 分析变更文件
      const changes = await getChangedFiles(currentInfo.version, latest)
      needsDeps = changes.needsDeps
      needsRestart = changes.needsRestart
      needsMigration = changes.needsMigration
      frontendOnly = changes.frontendOnly
    }
    
    const info: VersionInfo = {
      current: currentInfo.version,
      currentPatch: currentInfo.patch,
      latest,
      latestPatch,
      hasUpdate,
      releaseNotes: latestInfo?.notes || '',
      releaseDate: latestInfo?.date || '',
      needsRestart,
      needsDeps,
      needsMigration,
      frontendOnly,
      hasGit: gitAvailable,
    }
    
    res.json({ ok: true, data: info })
  } catch (error) {
    logger.error('检查更新失败', { error })
    res.status(500).json({ ok: false, message: '检查更新失败' })
  }
})

/**
 * POST /api/admin/update/pull - 拉取更新
 */
router.post('/pull', requireAuth, requireRoot, async (_req: AuthedRequest, res: Response) => {
  try {
    const gitAvailable = await hasGit()
    if (!gitAvailable) {
      return res.status(400).json({ ok: false, message: '当前环境没有 Git，无法拉取更新' })
    }
    
    logger.info('开始拉取更新')
    
    // 拉取代码
    const { stdout, stderr } = await execAsync('git pull origin main', { cwd: ROOT_DIR })
    logger.info('Git pull 完成', { stdout, stderr })
    
    res.json({ ok: true, data: { message: '代码更新成功', output: stdout } })
  } catch (error) {
    logger.error('拉取更新失败', { error })
    res.status(500).json({ ok: false, message: '拉取更新失败' })
  }
})

/**
 * POST /api/admin/update/deps - 安装依赖
 */
router.post('/deps', requireAuth, requireRoot, async (_req: AuthedRequest, res: Response) => {
  try {
    logger.info('开始安装依赖')
    
    // 安装后端依赖
    await execAsync('npm install', { cwd: path.join(ROOT_DIR, 'backend'), timeout: 300000 })
    logger.info('后端依赖安装完成')
    
    // 安装前端依赖
    await execAsync('npm install', { cwd: path.join(ROOT_DIR, 'frontend'), timeout: 300000 })
    logger.info('前端依赖安装完成')
    
    res.json({ ok: true, data: { message: '依赖安装成功' } })
  } catch (error) {
    logger.error('安装依赖失败', { error })
    res.status(500).json({ ok: false, message: '安装依赖失败' })
  }
})

/**
 * POST /api/admin/update/restart - 重启服务
 * 
 * 重启策略：
 * 1. 使用 spawn/exec 启动新的后端进程（detached）
 * 2. 新进程启动后，当前进程退出
 * 3. 这样可以实现无缝重启
 */
router.post('/restart', requireAuth, requireRoot, async (_req: AuthedRequest, res: Response) => {
  try {
    logger.info('准备重启服务')
    
    // 先返回响应
    res.json({ ok: true, data: { message: '服务即将重启，请稍后刷新页面' } })
    
    // 延迟执行重启
    setTimeout(async () => {
      logger.info('执行重启')
      
      const backendDir = path.join(ROOT_DIR, 'backend')
      
      if (process.platform === 'win32') {
        // Windows: 使用 exec + PowerShell Start-Process 完全隐藏窗口
        const psCmd = `Start-Process -WindowStyle Hidden -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory '${backendDir.replace(/'/g, "''")}'`
        exec(`powershell -Command "${psCmd}"`, { windowsHide: true })
        logger.info('Windows: 新进程已启动（隐藏窗口）')
      } else {
        // Linux/Mac: 使用 spawn 启动新进程
        const child = spawn('npm', ['run', 'dev'], {
          cwd: backendDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env }
        })
        child.unref()
        logger.info('Linux: 新进程已启动')
      }
      
      logger.info('当前进程即将退出')
      
      // 给一点时间让新进程启动
      setTimeout(() => {
        process.exit(0)
      }, 500)
    }, 1000)
  } catch (error) {
    logger.error('重启失败', { error })
    res.status(500).json({ ok: false, message: '重启失败' })
  }
})

/**
 * POST /api/admin/update/full - 完整更新（拉取 + 依赖 + 重启）
 */
router.post('/full', requireAuth, requireRoot, async (req: AuthedRequest, res: Response) => {
  try {
    const { needsDeps, needsRestart } = req.body as { needsDeps?: boolean; needsRestart?: boolean }
    
    const gitAvailable = await hasGit()
    if (!gitAvailable) {
      return res.status(400).json({ ok: false, message: '当前环境没有 Git，无法更新。请手动下载最新版本。' })
    }
    
    logger.info('开始完整更新', { needsDeps, needsRestart })
    
    // 1. 拉取代码
    await execAsync('git pull origin main', { cwd: ROOT_DIR })
    logger.info('代码拉取完成')
    
    // 2. 安装依赖（如果需要）
    if (needsDeps) {
      await execAsync('npm install', { cwd: path.join(ROOT_DIR, 'backend'), timeout: 300000 })
      await execAsync('npm install', { cwd: path.join(ROOT_DIR, 'frontend'), timeout: 300000 })
      logger.info('依赖安装完成')
    }
    
    // 3. 重启（如果需要）
    if (needsRestart) {
      res.json({ ok: true, data: { message: '更新完成，服务即将重启' } })
      
      setTimeout(() => {
        const backendDir = path.join(ROOT_DIR, 'backend')
        
        if (process.platform === 'win32') {
          // Windows: 使用 exec + PowerShell Start-Process 完全隐藏窗口
          const psCmd = `Start-Process -WindowStyle Hidden -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory '${backendDir.replace(/'/g, "''")}'`
          exec(`powershell -Command "${psCmd}"`, { windowsHide: true })
        } else {
          // Linux/Mac: 使用 spawn 启动新进程
          const child = spawn('npm', ['run', 'dev'], {
            cwd: backendDir,
            detached: true,
            stdio: 'ignore',
            env: { ...process.env }
          })
          child.unref()
        }
        
        // 给一点时间让新进程启动
        setTimeout(() => {
          process.exit(0)
        }, 500)
      }, 1000)
      return
    }
    
    res.json({ ok: true, data: { message: '更新完成，无需重启' } })
  } catch (error) {
    logger.error('完整更新失败', { error })
    res.status(500).json({ ok: false, message: '更新失败' })
  }
})

export const updateRouter = router
