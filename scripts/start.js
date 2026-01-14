/**
 * Start 启动页 - Windows 一键启动脚本
 */

const { execSync, exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const net = require('net')
const readline = require('readline')

// 项目目录
const ROOT_DIR = path.resolve(__dirname, '..')
const BACKEND_DIR = path.join(ROOT_DIR, 'backend')
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend')

// 端口
const BACKEND_PORT = 3100
const FRONTEND_PORT = 5173

// 是否正在关闭中（防止重复触发）
let isShuttingDown = false

// 优雅关闭函数（同步版本，用于信号处理）
async function gracefulShutdown(reason) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log()
  console.log(`\x1b[33m${reason}，正在关闭所有服务...\x1b[0m`)
  
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  
  // 关闭前后端
  try {
    execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${actualBackendPort}') do taskkill /PID %a /F 2>nul`, { 
      shell: 'cmd.exe', 
      stdio: 'pipe' 
    })
  } catch {}
  
  try {
    execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${FRONTEND_PORT}') do taskkill /PID %a /F 2>nul`, { 
      shell: 'cmd.exe', 
      stdio: 'pipe' 
    })
  } catch {}
  
  // 关闭数据库
  try {
    execSync('docker compose down', { cwd: ROOT_DIR, stdio: 'pipe', timeout: 30000 })
  } catch {}
  
  console.log(`  \x1b[32m✓\x1b[0m 所有服务已停止`)
  console.log()
  console.log('感谢使用，再见！')
  
  process.exit(0)
}

// 捕获 Ctrl+C
process.on('SIGINT', () => gracefulShutdown('检测到 Ctrl+C'))

// 捕获窗口关闭（Windows）
process.on('SIGHUP', () => gracefulShutdown('检测到窗口关闭'))

// 捕获进程终止信号
process.on('SIGTERM', () => gracefulShutdown('检测到终止信号'))

// Windows 特有：捕获控制台关闭事件
if (process.platform === 'win32') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  rl.on('SIGINT', () => gracefulShutdown('检测到 Ctrl+C'))
  // 不关闭 rl，让它持续监听
}

// 颜色
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

// 检查端口是否被 Windows Hyper-V 保留
function isPortReservedByHyperV(port) {
  try {
    const result = execSync('netsh interface ipv4 show excludedportrange protocol=tcp', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    })
    const lines = result.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+(\d+)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        if (port >= start && port <= end) {
          return { reserved: true, range: `${start}-${end}` }
        }
      }
    }
    return { reserved: false }
  } catch {
    return { reserved: false }
  }
}

// 检查端口是否已被我们永久保留（带 * 标记的是管理的端口）
function isPortPermanentlyReserved(port) {
  try {
    const result = execSync('netsh interface ipv4 show excludedportrange protocol=tcp', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    })
    const lines = result.split('\n')
    for (const line of lines) {
      // 带 * 标记的是永久保留的端口
      if (line.includes('*')) {
        const match = line.match(/^\s*(\d+)\s+(\d+)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = parseInt(match[2], 10)
          if (port >= start && port <= end) {
            return true
          }
        }
      }
    }
    return false
  } catch {
    return false
  }
}

// 尝试为端口添加永久保留（需要管理员权限）
function tryReservePort(port) {
  try {
    // 先检查端口是否已经被我们永久保留了
    if (isPortPermanentlyReserved(port)) {
      return { success: true, alreadyReserved: true }
    }
    
    // 尝试停止 winnat，添加保留，再启动 winnat
    // 这需要管理员权限
    info('正在停止 WinNAT 服务...')
    execSync('net stop winnat', { stdio: 'pipe', timeout: 10000 })
    
    info(`正在永久保留端口 ${port}...`)
    execSync(`netsh int ipv4 add excludedportrange protocol=tcp startport=${port} numberofports=1 store=persistent`, { stdio: 'pipe', timeout: 10000 })
    
    info('正在重启 WinNAT 服务...')
    execSync('net start winnat', { stdio: 'pipe', timeout: 10000 })
    
    return { success: true, alreadyReserved: false }
  } catch (e) {
    // 尝试重启 winnat（即使添加失败也要确保 winnat 运行）
    try {
      execSync('net start winnat', { stdio: 'pipe', timeout: 10000 })
    } catch {}
    
    return { success: false, error: e.message, needsAdmin: true }
  }
}

// 更新 env.local 中的端口
function updateEnvPort(newPort) {
  const envPath = path.join(BACKEND_DIR, 'env.local')
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8')
    content = content.replace(/^PORT=\d+/m, `PORT=${newPort}`)
    fs.writeFileSync(envPath, content)
    return true
  }
  return false
}

// 更新前端 API 端口配置
function updateFrontendApiPort(newPort) {
  const apiPath = path.join(FRONTEND_DIR, 'src', 'services', 'api.ts')
  if (fs.existsSync(apiPath)) {
    let content = fs.readFileSync(apiPath, 'utf8')
    // 替换硬编码的端口号
    content = content.replace(/:\d{4}(['"`])/g, `:${newPort}$1`)
    fs.writeFileSync(apiPath, content)
    return true
  }
  return false
}

// 清屏
const clear = () => console.clear()

// 输出函数
const log = (msg = '') => console.log(msg)
const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`)
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`)
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`)
const info = (msg) => console.log(`  ${c.dim}${msg}${c.reset}`)

// 显示标题
function showHeader() {
  log()
  log(`${c.blue}╔════════════════════════════════════════════════════╗${c.reset}`)
  log(`${c.blue}║         Start 启动页 - 控制面板                    ║${c.reset}`)
  log(`${c.blue}╚════════════════════════════════════════════════════╝${c.reset}`)
  log()
}

// 检查命令是否存在
function hasCommand(cmd) {
  try {
    execSync(`where ${cmd}`, { stdio: 'pipe' })
    return true
  } catch { return false }
}

// 执行命令
function run(cmd, cwd = ROOT_DIR) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' })
    return true
  } catch { return false }
}

// 检查端口是否被占用（返回 true 表示有服务在监听）
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)  // 端口有服务在监听
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)  // 端口没有服务
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, '127.0.0.1')
  })
}

// 等待端口就绪
function waitForPort(port, timeout = 60000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start < timeout) {
          setTimeout(check, 1000)
        } else {
          resolve(false)
        }
      })
      socket.connect(port, '127.0.0.1')
    }
    check()
  })
}

// 延时
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 后台启动进程（完全隐藏窗口）
function startBackground(cwd, script) {
  // 使用 PowerShell 的 Start-Process 完全隐藏窗口
  const psCmd = `Start-Process -WindowStyle Hidden -FilePath 'npm.cmd' -ArgumentList 'run','${script}' -WorkingDirectory '${cwd.replace(/'/g, "''")}'`
  exec(`powershell -Command "${psCmd}"`, { windowsHide: true })
}

// 杀死占用端口的进程
async function killPort(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: 'pipe' })
    const lines = result.trim().split('\n')
    const pids = new Set()
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' })
      } catch {}
    }
    return true
  } catch {
    return false
  }
}

// 读取用户输入
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// 启动 Docker Desktop
async function startDocker() {
  // 尝试常见的 Docker Desktop 路径
  const dockerPaths = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    'C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe',
    `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`,
  ]
  
  for (const p of dockerPaths) {
    if (fs.existsSync(p)) {
      exec(`"${p}"`)
      return true
    }
  }
  
  // 尝试通过开始菜单启动
  try {
    exec('start "" "Docker Desktop"')
    return true
  } catch {}
  
  return false
}

// 等待 Docker 就绪
async function waitForDocker(timeout = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (run('docker info')) {
      return true
    }
    await sleep(3000)
  }
  return false
}

// 检查环境
async function checkEnvironment() {
  log(`${c.yellow}[环境检测]${c.reset}`)
  log('────────────────────────────────────────')
  
  // Node.js
  const nodeVer = execSync('node -v', { encoding: 'utf8' }).trim()
  ok(`Node.js ${nodeVer}`)

  // Docker
  if (!hasCommand('docker')) {
    fail('未找到 Docker')
    info('请安装 Docker Desktop: https://www.docker.com/products/docker-desktop/')
    exec('start https://www.docker.com/products/docker-desktop/')
    return false
  }
  ok('Docker 已安装')
  
  // 检查 Docker 是否运行
  if (!run('docker info')) {
    warn('Docker 未运行，正在启动...')
    
    if (!startDocker()) {
      fail('无法启动 Docker Desktop')
      info('请手动启动 Docker Desktop')
      return false
    }
    
    info('等待 Docker 启动 (最多 2 分钟)...')
    if (await waitForDocker(120000)) {
      ok('Docker 已启动')
    } else {
      fail('Docker 启动超时')
      info('请确保 Docker Desktop 已完全启动后重试')
      return false
    }
  } else {
    ok('Docker 已运行')
  }
  
  // 检查后端端口是否被 Hyper-V 保留（仅 Windows）
  if (process.platform === 'win32') {
    const portCheck = isPortReservedByHyperV(BACKEND_PORT)
    if (portCheck.reserved) {
      warn(`端口 ${BACKEND_PORT} 被 Windows Hyper-V 动态保留 (范围: ${portCheck.range})`)
      info('尝试永久保留端口 (需要管理员权限)...')
      
      const reserveResult = tryReservePort(BACKEND_PORT)
      if (reserveResult.success) {
        if (reserveResult.alreadyReserved) {
          ok(`端口 ${BACKEND_PORT} 已被永久保留`)
        } else {
          ok(`已成功永久保留端口 ${BACKEND_PORT}`)
          info('下次重启后 Hyper-V 将不再占用此端口')
        }
      } else {
        fail('无法自动保留端口 (需要管理员权限)')
        log()
        log(`${c.yellow}请以管理员身份运行以下命令来永久解决此问题:${c.reset}`)
        log()
        log(`  ${c.cyan}net stop winnat${c.reset}`)
        log(`  ${c.cyan}netsh int ipv4 add excludedportrange protocol=tcp startport=${BACKEND_PORT} numberofports=1 store=persistent${c.reset}`)
        log(`  ${c.cyan}net start winnat${c.reset}`)
        log()
        info('或者以管理员身份运行此启动脚本')
        log()
        return false
      }
    } else {
      ok(`后端端口 ${BACKEND_PORT} 可用`)
    }
  }
  global.ACTUAL_BACKEND_PORT = BACKEND_PORT
  
  log()
  return true
}

// 检查 PostgreSQL 是否真正可用（不只是端口开放）
async function checkPostgresReady() {
  try {
    // 尝试通过 docker exec 检查 PostgreSQL 是否接受连接
    execSync('docker compose exec -T postgres pg_isready -U start', { 
      cwd: ROOT_DIR, 
      stdio: 'pipe',
      timeout: 5000
    })
    return true
  } catch {
    return false
  }
}

// 获取容器状态
function getContainerStatus() {
  try {
    const result = execSync('docker compose ps --format json', { 
      cwd: ROOT_DIR, 
      encoding: 'utf8',
      stdio: 'pipe'
    })
    // docker compose ps 可能返回多行 JSON
    const lines = result.trim().split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const container = JSON.parse(line)
        if (container.Service === 'postgres' || container.Name?.includes('postgres')) {
          return {
            name: container.Name,
            state: container.State,
            status: container.Status,
            health: container.Health
          }
        }
      } catch {}
    }
    return null
  } catch {
    // 旧版 docker-compose 可能不支持 --format json
    try {
      const result = execSync('docker compose ps', { 
        cwd: ROOT_DIR, 
        encoding: 'utf8',
        stdio: 'pipe'
      })
      if (result.includes('postgres') && result.includes('Up')) {
        return { state: 'running', status: 'Up' }
      }
      return { state: 'unknown', status: result }
    } catch {
      return null
    }
  }
}

// 启动数据库
async function startDatabase() {
  log(`${c.yellow}[1/4] 启动数据库${c.reset}`)
  log('────────────────────────────────────────')
  
  // 先检查端口和数据库是否真正可用
  if (await checkPort(5432)) {
    if (await checkPostgresReady()) {
      ok('PostgreSQL 已在运行且可用')
      log()
      return true
    } else {
      warn('端口 5432 已开放，但数据库可能未就绪')
    }
  }
  
  info('启动 PostgreSQL...')
  
  // 尝试 docker compose (新版) 或 docker-compose (旧版)
  try {
    execSync('docker compose up -d', { cwd: ROOT_DIR, stdio: 'inherit' })
  } catch {
    try {
      execSync('docker-compose up -d', { cwd: ROOT_DIR, stdio: 'inherit' })
    } catch (e) {
      fail('Docker Compose 命令执行失败')
      return false
    }
  }
  
  info('等待数据库就绪...')
  
  // 等待数据库真正可用（最多 60 秒）
  const startTime = Date.now()
  const timeout = 60000
  let lastStatus = ''
  let dots = 0
  
  while (Date.now() - startTime < timeout) {
    // 检查容器状态
    const container = getContainerStatus()
    
    if (container) {
      const statusStr = container.status || container.state || ''
      if (statusStr !== lastStatus) {
        if (lastStatus) {
          process.stdout.write('\r' + ' '.repeat(60) + '\r')
        }
        info(`容器状态: ${statusStr}`)
        lastStatus = statusStr
      }
    }
    
    // 检查数据库是否真正可用
    if (await checkPort(5432) && await checkPostgresReady()) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r')
      ok('PostgreSQL 启动成功且可接受连接')
      log()
      return true
    }
    
    dots = (dots + 1) % 4
    process.stdout.write(`\r  ${c.dim}等待数据库就绪${'.'.repeat(dots)}${' '.repeat(3 - dots)}${c.reset}`)
    await sleep(2000)
  }
  
  process.stdout.write('\r' + ' '.repeat(60) + '\r')
  fail('PostgreSQL 启动超时')
  
  // 显示更多诊断信息
  log()
  info('诊断信息:')
  
  const container = getContainerStatus()
  if (container) {
    info(`  容器状态: ${container.state || '未知'}`)
    info(`  详细状态: ${container.status || '未知'}`)
  } else {
    info('  容器状态: 未找到容器')
  }
  
  const portOpen = await checkPort(5432)
  info(`  端口 5432: ${portOpen ? '已开放' : '未开放'}`)
  
  log()
  info('请尝试以下命令查看详细日志:')
  info('  docker compose logs postgres')
  log()
  
  return false
}

// 配置后端
async function configureBackend() {
  log(`${c.yellow}[2/4] 配置后端${c.reset}`)
  log('────────────────────────────────────────')
  
  const envLocal = path.join(BACKEND_DIR, 'env.local')
  const envExample = path.join(BACKEND_DIR, 'env.example')
  
  // 首次创建配置文件时自动生成安全的 JWT_SECRET
  if (!fs.existsSync(envLocal) && fs.existsSync(envExample)) {
    let content = fs.readFileSync(envExample, 'utf8')
    const newSecret = generateJwtSecret()
    content = content.replace(/JWT_SECRET="[^"]*"/, `JWT_SECRET="${newSecret}"`)
    fs.writeFileSync(envLocal, content)
    ok('创建配置文件 env.local')
    ok('已自动生成安全的 JWT_SECRET')
  } else if (fs.existsSync(envLocal)) {
    ok('配置文件已存在')
    
    // 检查现有配置是否使用不安全的默认值
    const content = fs.readFileSync(envLocal, 'utf8')
    const insecureSecrets = [
      'please-change-me',
      'please-change-me-to-random-string',
      'dev-secret-please-change-1234',
    ]
    
    let currentSecret = ''
    const match = content.match(/JWT_SECRET="([^"]*)"/)
    if (match) {
      currentSecret = match[1]
    }
    
    if (insecureSecrets.includes(currentSecret)) {
      log()
      log(`${c.yellow}════════════════════════════════════════════════════${c.reset}`)
      log(`${c.yellow}⚠️  安全警告：JWT_SECRET 使用了不安全的默认值！${c.reset}`)
      log(`${c.yellow}════════════════════════════════════════════════════${c.reset}`)
      log()
      info('这意味着任何人都可以伪造登录 token，')
      info('以任意用户身份（包括管理员）登录你的系统。')
      log()
      
      const answer = await prompt(`是否自动生成安全的 JWT_SECRET？(y/n): `)
      if (answer.toLowerCase() === 'y') {
        const newSecret = generateJwtSecret()
        const newContent = content.replace(/JWT_SECRET="[^"]*"/, `JWT_SECRET="${newSecret}"`)
        fs.writeFileSync(envLocal, newContent)
        ok('已生成并保存新的 JWT_SECRET')
        info('注意：所有已登录用户需要重新登录')
      } else {
        warn('跳过 JWT_SECRET 更新，请稍后手动修改 backend/env.local')
      }
      log()
    }
  }
  
  log()
  return true
}

// 生成安全的 JWT_SECRET（64 字符随机字符串）
function generateJwtSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const crypto = require('crypto')
  const randomBytes = crypto.randomBytes(64)
  for (let i = 0; i < 64; i++) {
    result += chars[randomBytes[i] % chars.length]
  }
  return result
}

// 安装依赖
async function installDeps() {
  log(`${c.yellow}[3/4] 检查依赖${c.reset}`)
  log('────────────────────────────────────────')
  
  const backendModules = path.join(BACKEND_DIR, 'node_modules')
  const frontendModules = path.join(FRONTEND_DIR, 'node_modules')
  
  if (!fs.existsSync(backendModules)) {
    info('安装后端依赖 (首次需要较长时间)...')
    try {
      execSync('npm install', { cwd: BACKEND_DIR, stdio: 'inherit' })
      ok('后端依赖安装完成')
    } catch {
      fail('后端依赖安装失败')
      return false
    }
  } else {
    ok('后端依赖已就绪')
  }
  
  if (!fs.existsSync(frontendModules)) {
    info('安装前端依赖 (首次需要较长时间)...')
    try {
      execSync('npm install', { cwd: FRONTEND_DIR, stdio: 'inherit' })
      ok('前端依赖安装完成')
    } catch {
      fail('前端依赖安装失败')
      return false
    }
  } else {
    ok('前端依赖已就绪')
  }
  
  log()
  return true
}

// 日志文件路径
const BACKEND_LOG_FILE = path.join(ROOT_DIR, '.start', 'backend.log')
const FRONTEND_LOG_FILE = path.join(ROOT_DIR, '.start', 'frontend.log')

// 确保 .start 目录存在
function ensureStartDir() {
  const startDir = path.join(ROOT_DIR, '.start')
  if (!fs.existsSync(startDir)) {
    fs.mkdirSync(startDir, { recursive: true })
  }
}

// 后台启动进程并记录日志（使用 cmd 重定向）
function startBackgroundWithLog(cwd, script, logFile) {
  ensureStartDir()
  
  // 尝试清空旧日志（如果文件被锁定则跳过）
  try {
    // 先尝试删除旧文件
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile)
    }
  } catch {
    // 文件可能被锁定，尝试使用新文件名
    const timestamp = Date.now()
    logFile = logFile.replace('.log', `-${timestamp}.log`)
  }
  
  // 创建空日志文件
  try {
    fs.writeFileSync(logFile, '')
  } catch {
    // 如果还是失败，使用临时文件
    logFile = path.join(ROOT_DIR, '.start', `temp-${Date.now()}.log`)
    fs.writeFileSync(logFile, '')
  }
  
  // 使用 cmd 的重定向来捕获输出
  // npm run dev 2>&1 > logfile 会把 stdout 和 stderr 都写入日志
  const cmdScript = `cd /d "${cwd}" && npm.cmd run ${script} > "${logFile}" 2>&1`
  
  // 使用 PowerShell 在后台运行 cmd 命令
  const psCmd = `Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c','${cmdScript.replace(/'/g, "''")}'`
  
  exec(`powershell -Command "${psCmd}"`, { windowsHide: true })
  
  return logFile
}

// 读取日志文件的最后几行
function readLogTail(logFile, lines = 30) {
  try {
    if (!fs.existsSync(logFile)) return null
    const content = fs.readFileSync(logFile, 'utf8')
    if (!content.trim()) return null
    const allLines = content.split('\n')
    return allLines.slice(-lines).join('\n')
  } catch {
    return null
  }
}

// 获取占用端口的进程信息
function getPortProcess(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' })
    const lines = result.trim().split('\n')
    if (lines.length > 0) {
      const parts = lines[0].trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== '0') {
        try {
          const taskInfo = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', stdio: 'pipe' })
          const match = taskInfo.match(/"([^"]+)"/)
          const processName = match ? match[1] : '未知进程'
          return { pid, name: processName }
        } catch {
          return { pid, name: '未知进程' }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// 启动服务
async function startServices() {
  log(`${c.yellow}[4/4] 启动服务${c.reset}`)
  log('────────────────────────────────────────')
  
  // 使用动态检测的端口
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  
  // 检查后端端口
  const backendPortInUse = await checkPort(actualBackendPort)
  if (backendPortInUse) {
    const proc = getPortProcess(actualBackendPort)
    if (proc) {
      warn(`端口 ${actualBackendPort} 已被占用`)
      info(`占用进程: ${proc.name} (PID: ${proc.pid})`)
      
      // 如果是 node 进程，可能是之前的后端
      if (proc.name.toLowerCase().includes('node')) {
        info('检测到可能是之前未关闭的后端服务')
        const answer = await prompt(`是否终止该进程并重新启动? (y/n): `)
        if (answer.toLowerCase() === 'y') {
          await killPort(actualBackendPort)
          await sleep(1000)
        } else {
          ok('使用现有后端服务')
        }
      } else {
        fail(`端口 ${actualBackendPort} 被其他程序占用，请手动关闭后重试`)
        return false
      }
    } else {
      ok('后端已在运行')
    }
  }
  
  // 启动后端（如果端口现在空闲）
  if (!(await checkPort(actualBackendPort))) {
    info('启动后端服务...')
    startBackgroundWithLog(BACKEND_DIR, 'dev', BACKEND_LOG_FILE)
    
    // 显示等待进度
    const startTime = Date.now()
    const timeout = 60000
    let dots = 0
    let lastLogCheck = 0
    
    while (Date.now() - startTime < timeout) {
      if (await checkPort(actualBackendPort)) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r')
        ok(`后端启动成功 (端口 ${actualBackendPort})`)
        break
      }
      
      // 每 5 秒检查一次日志是否有错误
      if (Date.now() - lastLogCheck > 5000) {
        lastLogCheck = Date.now()
        const logContent = readLogTail(BACKEND_LOG_FILE, 10)
        if (logContent) {
          // 检查是否有明显的错误
          const hasError = logContent.toLowerCase().includes('error') || 
                          logContent.includes('ECONNREFUSED') ||
                          logContent.includes('failed') ||
                          logContent.includes('Cannot find')
          if (hasError) {
            process.stdout.write('\r' + ' '.repeat(60) + '\r')
            warn('检测到可能的错误，继续等待...')
          }
        }
      }
      
      dots = (dots + 1) % 4
      process.stdout.write(`\r  ${c.dim}等待后端启动${'.'.repeat(dots)}${' '.repeat(3 - dots)}${c.reset}`)
      await sleep(1000)
    }
    
    if (!(await checkPort(actualBackendPort))) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r')
      fail('后端启动超时')
      log()
      
      // 显示详细的错误日志
      log(`${c.yellow}═══ 后端启动日志 ═══${c.reset}`)
      const logContent = readLogTail(BACKEND_LOG_FILE, 50)
      if (logContent) {
        log()
        // 高亮显示错误行
        const lines = logContent.split('\n')
        for (const line of lines) {
          if (line.toLowerCase().includes('error') || 
              line.includes('ECONNREFUSED') ||
              line.includes('failed') ||
              line.includes('Cannot find')) {
            log(`  ${c.red}${line}${c.reset}`)
          } else if (line.trim()) {
            log(`  ${c.dim}${line}${c.reset}`)
          }
        }
        log()
      } else {
        info('未能获取日志内容')
        log()
      }
      
      log(`${c.yellow}═══ 诊断信息 ═══${c.reset}`)
      log()
      
      // 检查数据库连接
      const dbReady = await checkPostgresReady()
      if (dbReady) {
        ok('数据库连接: 正常')
      } else {
        fail('数据库连接: 失败')
        info('  后端无法连接到 PostgreSQL 数据库')
      }
      
      // 检查 Prisma 客户端
      const prismaClient = path.join(BACKEND_DIR, 'node_modules', '.prisma', 'client')
      if (fs.existsSync(prismaClient)) {
        ok('Prisma 客户端: 已生成')
      } else {
        fail('Prisma 客户端: 未生成')
        info('  尝试运行: cd backend && npx prisma generate')
      }
      
      // 检查 env.local
      const envLocal = path.join(BACKEND_DIR, 'env.local')
      if (fs.existsSync(envLocal)) {
        ok('配置文件: 存在')
        // 检查 DATABASE_URL
        const envContent = fs.readFileSync(envLocal, 'utf8')
        if (envContent.includes('DATABASE_URL')) {
          ok('DATABASE_URL: 已配置')
        } else {
          fail('DATABASE_URL: 未配置')
        }
      } else {
        fail('配置文件: 不存在')
      }
      
      log()
      info('建议操作:')
      info('  1. 手动启动后端查看完整错误: cd backend && npm run dev')
      info('  2. 检查数据库迁移: cd backend && npx prisma migrate deploy')
      info('  3. 重新生成 Prisma: cd backend && npx prisma generate')
      info(`  4. 查看完整日志: type "${BACKEND_LOG_FILE}"`)
      log()
      
      return false
    }
  } else {
    ok('后端已在运行')
  }

  // 检查前端端口
  const frontendPortInUse = await checkPort(FRONTEND_PORT)
  if (frontendPortInUse) {
    const proc = getPortProcess(FRONTEND_PORT)
    if (proc) {
      if (proc.name.toLowerCase().includes('node')) {
        ok('前端已在运行')
      } else {
        warn(`端口 ${FRONTEND_PORT} 已被占用`)
        info(`占用进程: ${proc.name} (PID: ${proc.pid})`)
        fail(`端口 ${FRONTEND_PORT} 被其他程序占用，请手动关闭后重试`)
        return false
      }
    } else {
      ok('前端已在运行')
    }
  } else {
    info('启动前端服务...')
    startBackgroundWithLog(FRONTEND_DIR, 'dev', FRONTEND_LOG_FILE)
    
    // 显示等待进度
    const startTime = Date.now()
    const timeout = 60000
    let dots = 0
    
    while (Date.now() - startTime < timeout) {
      if (await checkPort(FRONTEND_PORT)) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r')
        ok('前端启动成功 (端口 5173)')
        break
      }
      dots = (dots + 1) % 4
      process.stdout.write(`\r  ${c.dim}等待前端启动${'.'.repeat(dots)}${' '.repeat(3 - dots)}${c.reset}`)
      await sleep(1000)
    }
    
    if (!(await checkPort(FRONTEND_PORT))) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r')
      fail('前端启动超时')
      log()
      
      // 显示前端日志
      log(`${c.yellow}═══ 前端启动日志 ═══${c.reset}`)
      const logContent = readLogTail(FRONTEND_LOG_FILE, 30)
      if (logContent) {
        log()
        log(`  ${c.dim}${logContent}${c.reset}`)
        log()
      }
      
      info('尝试手动启动查看详细错误:')
      info('  cd frontend && npm run dev')
      return false
    }
  }
  
  log()
  return true
}

// 显示成功信息
function showSuccess() {
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  log('════════════════════════════════════════════════════')
  log(`${c.green}🎉 所有服务已启动！${c.reset}`)
  log('════════════════════════════════════════════════════')
  log()
  log(`  访问地址: ${c.cyan}http://localhost:5173${c.reset}`)
  log(`  管理后台: ${c.cyan}http://localhost:5173/admin${c.reset}`)
  log(`  后端 API: ${c.cyan}http://localhost:${actualBackendPort}${c.reset}`)
  log(`  默认账号: ${c.yellow}admin${c.reset} / ${c.yellow}admin123456${c.reset}`)
  log()
}

// 显示菜单
async function showMenu() {
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  const backendRunning = await checkPort(actualBackendPort)
  const frontendRunning = await checkPort(FRONTEND_PORT)
  
  log('────────────────────────────────────────')
  log(`${c.yellow}请选择操作:${c.reset}`)
  log()
  log(`  ${c.cyan}1${c.reset} - 打开浏览器`)
  log(`  ${c.cyan}2${c.reset} - 重启前后端服务`)
  if (backendRunning || frontendRunning) {
    log(`  ${c.cyan}3${c.reset} - 停止前后端服务`)
  }
  log(`  ${c.cyan}4${c.reset} - 查看服务状态`)
  log(`  ${c.cyan}5${c.reset} - 关闭控制面板 (服务继续运行)`)
  log(`  ${c.cyan}0${c.reset} - 退出并关闭所有服务 (包括数据库)`)
  log()
  
  const choice = await prompt(`请输入选项 [0-5]: `)
  return choice
}

// 停止前后端
async function stopFrontendBackend() {
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  log()
  log(`${c.yellow}停止前后端服务...${c.reset}`)
  
  await killPort(actualBackendPort)
  await killPort(FRONTEND_PORT)
  await sleep(1000)
  
  if (!(await checkPort(actualBackendPort)) && !(await checkPort(FRONTEND_PORT))) {
    ok('前后端服务已停止')
  } else {
    // 强制杀死所有 node 进程
    try {
      execSync('taskkill /IM node.exe /F', { stdio: 'pipe' })
    } catch {}
    ok('服务已停止')
  }
  
  // 等待文件句柄释放
  await sleep(2000)
  
  // 清理旧日志文件
  try {
    const startDir = path.join(ROOT_DIR, '.start')
    if (fs.existsSync(startDir)) {
      const files = fs.readdirSync(startDir)
      for (const file of files) {
        if (file.endsWith('.log')) {
          try {
            fs.unlinkSync(path.join(startDir, file))
          } catch {}
        }
      }
    }
  } catch {}
  
  log()
}

// 停止所有服务
async function stopAll() {
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  log()
  log(`${c.yellow}停止所有服务...${c.reset}`)
  
  await killPort(actualBackendPort)
  await killPort(FRONTEND_PORT)
  run('docker compose down')
  
  ok('所有服务已停止')
  log()
}

// 查看状态
async function showStatus() {
  const actualBackendPort = global.ACTUAL_BACKEND_PORT || BACKEND_PORT
  log()
  log(`${c.yellow}服务状态:${c.reset}`)
  log('────────────────────────────────────────')
  
  const dbPortOpen = await checkPort(5432)
  const dbReady = dbPortOpen && await checkPostgresReady()
  const backendRunning = await checkPort(actualBackendPort)
  const frontendRunning = await checkPort(FRONTEND_PORT)
  
  if (dbReady) {
    ok('数据库: 运行中且可用 (端口 5432)')
  } else if (dbPortOpen) {
    warn('数据库: 端口开放但连接失败 (端口 5432)')
    info('  可能正在启动中，请稍后重试')
  } else {
    fail('数据库: 未运行')
  }
  
  if (backendRunning) ok(`后端: 运行中 (端口 ${actualBackendPort})`)
  else fail('后端: 未运行')
  
  if (frontendRunning) ok('前端: 运行中 (端口 5173)')
  else fail('前端: 未运行')
  
  log()
}

// 主函数
async function main() {
  clear()
  showHeader()
  
  const actualBackendPort = BACKEND_PORT
  global.ACTUAL_BACKEND_PORT = actualBackendPort
  
  // 检查服务是否已在运行
  const backendRunning = await checkPort(actualBackendPort)
  const frontendRunning = await checkPort(FRONTEND_PORT)
  const dbRunning = await checkPort(5432)
  
  if (backendRunning && frontendRunning && dbRunning) {
    // 服务已在运行，直接显示菜单
    log(`${c.green}检测到服务已在运行${c.reset}`)
    log()
    showSuccess()
    
    // 直接进入菜单循环
    while (true) {
      const choice = await showMenu()
      await handleMenuChoice(choice)
    }
  }
  
  // 检查环境
  if (!await checkEnvironment()) {
    await prompt('按回车键退出...')
    process.exit(1)
  }
  
  // 启动流程
  if (!await startDatabase()) {
    await prompt('按回车键退出...')
    process.exit(1)
  }
  
  if (!await configureBackend()) {
    await prompt('按回车键退出...')
    process.exit(1)
  }
  
  if (!await installDeps()) {
    await prompt('按回车键退出...')
    process.exit(1)
  }
  
  if (!await startServices()) {
    await prompt('按回车键退出...')
    process.exit(1)
  }
  
  showSuccess()
  
  // 打开浏览器
  exec('start http://localhost:5173')
  
  // 交互式菜单循环
  while (true) {
    const choice = await showMenu()
    await handleMenuChoice(choice)
  }
}

// 处理菜单选择
async function handleMenuChoice(choice) {
  switch (choice) {
    case '1':
      exec('start http://localhost:5173')
      log()
      ok('已打开浏览器')
      log()
      break
      
    case '2':
      log()
      log(`${c.yellow}重启前后端服务...${c.reset}`)
      await stopFrontendBackend()
      await startServices()
      showSuccess()
      break
      
    case '3':
      await stopFrontendBackend()
      log(`${c.yellow}是否重新启动服务?${c.reset}`)
      const restart = await prompt('输入 y 重启，其他键返回菜单: ')
      if (restart.toLowerCase() === 'y') {
        await startServices()
        showSuccess()
      }
      break
      
    case '4':
      await showStatus()
      break
      
    case '5':
      log()
      log('控制面板已关闭，服务继续在后台运行。')
      log('再次运行 start.bat 可重新打开控制面板。')
      log()
      process.exit(0)
      break
      
    case '0':
    case 'q':
    case 'exit':
      await stopAll()
      log('感谢使用，再见！')
      process.exit(0)
      break
      
    default:
      log()
      warn('无效选项，请重新选择')
      log()
  }
}

main().catch(e => {
  console.error('错误:', e.message)
  process.exit(1)
})
