import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import dotenv from 'dotenv'
import { z } from 'zod'

// 允许本地使用 backend/env.local 或 backend/env（不强依赖 .env）
const candidates = ['.env', 'env.local', 'env']
for (const name of candidates) {
  const p = path.resolve(process.cwd(), name)
  if (fs.existsSync(p)) {
    dotenv.config({ path: p })
    break
  }
}

/**
 * 智能选择默认 HOST 地址
 * - Windows 开发环境：使用 127.0.0.1 避免 Hyper-V 端口保留冲突
 * - Linux/生产环境：使用 0.0.0.0 允许外部访问
 * - 如果设置了 NODE_ENV=production，始终使用 0.0.0.0
 */
function getDefaultHost(): string {
  // 如果是生产环境，使用 0.0.0.0
  if (process.env.NODE_ENV === 'production') {
    return '0.0.0.0'
  }
  
  // Windows 开发环境使用 127.0.0.1 避免 Hyper-V 端口冲突
  if (os.platform() === 'win32') {
    return '127.0.0.1'
  }
  
  // Linux/Mac 等其他系统使用 0.0.0.0
  return '0.0.0.0'
}

// 不安全的默认 JWT_SECRET 列表
const INSECURE_JWT_SECRETS = [
  'please-change-me',
  'please-change-me-to-random-string',
  'dev-secret-please-change-1234',
]

/**
 * 检查 JWT_SECRET 是否安全
 */
function checkJwtSecretSecurity(): void {
  const secret = process.env.JWT_SECRET || ''
  
  if (INSECURE_JWT_SECRETS.includes(secret)) {
    console.log('')
    console.log('\x1b[43m\x1b[30m ⚠️  安全警告 \x1b[0m')
    console.log('\x1b[33m════════════════════════════════════════════════════\x1b[0m')
    console.log('\x1b[33m  JWT_SECRET 使用了不安全的默认值！\x1b[0m')
    console.log('')
    console.log('  这意味着任何人都可以伪造登录 token，')
    console.log('  以任意用户身份（包括管理员）登录你的系统。')
    console.log('')
    console.log('\x1b[36m  解决方法：\x1b[0m')
    console.log('  编辑 backend/env.local 文件，')
    console.log('  将 JWT_SECRET 修改为一个随机字符串（至少 32 字符）')
    console.log('')
    console.log('\x1b[36m  生成随机密钥：\x1b[0m')
    console.log('  - Linux/Mac: openssl rand -base64 32')
    console.log('  - PowerShell: [Convert]::ToBase64String((1..32|%{Get-Random -Max 256})-as[byte[]])')
    console.log('\x1b[33m════════════════════════════════════════════════════\x1b[0m')
    console.log('')
    
    // 生产环境直接拒绝启动
    if (process.env.NODE_ENV === 'production') {
      console.log('\x1b[31m  生产环境禁止使用默认 JWT_SECRET，服务器拒绝启动。\x1b[0m')
      console.log('')
      process.exit(1)
    }
  }
}

// 启动时检查 JWT_SECRET 安全性
checkJwtSecretSecurity()

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default(getDefaultHost()),
  // 日志配置
  LOG_LEVEL: z.string().default('info'),
  LOG_DIR: z.string().default('./logs'),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  LOG_CONSOLE: z.string().transform(v => v !== 'false').default('true'),
  LOG_FILE: z.string().transform(v => v !== 'false').default('true'),
})

export const env = EnvSchema.parse(process.env)


