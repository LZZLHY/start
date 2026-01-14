import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { hashPassword, signToken, verifyPassword } from '../services/auth'
import { ok, fail } from '../utils/http'
import { generateUniqueNickname, generateUniqueUsername } from '../utils/nickname'
import type { AuthedRequest } from '../types/auth'
import { audit, AuditAction } from '../services/auditLogger'

const RegisterSchema = z
  .object({
    username: z.string().trim().min(3).max(32).optional(),
    password: z.string().min(6).max(200),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(6).max(32).optional(),
    nickname: z.string().trim().min(2).max(32).optional(),
  })
  .refine((v) => Boolean(v.username) || Boolean(v.email) || Boolean(v.phone), {
    message: '账号、邮箱、手机号至少填写一个',
    path: ['username'],
  })

const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(200), // username / email / phone
  password: z.string().min(1).max(200),
})

export async function register(req: Request, res: Response) {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const { password, email, phone } = parsed.data
  const username = parsed.data.username?.trim() || (await generateUniqueUsername())
  const nickname = parsed.data.nickname?.trim() || (await generateUniqueNickname())

  try {
    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        nickname,
      },
      select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
    })

    // 记录注册审计日志
    await audit(req, AuditAction.REGISTER, 'user', {
      resourceId: user.id,
      details: { username, email: email || null },
      success: true,
      userId: user.id,
    })

    const token = signToken(user.id)
    return ok(res, { token, user })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '注册失败'
    
    // 记录注册失败审计日志
    await audit(req, AuditAction.REGISTER, 'user', {
      details: { username },
      success: false,
      errorMessage: msg.includes('Unique constraint') ? '账号/邮箱/手机号/昵称已被占用' : '注册失败',
      userId: null,
    })

    if (msg.includes('Unique constraint')) return fail(res, 409, '账号/邮箱/手机号/昵称已被占用')
    return fail(res, 500, '注册失败')
  }
}

export async function login(req: Request, res: Response) {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const { identifier, password } = parsed.data
  const id = identifier.trim()

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: id }, { email: id }, { phone: id }],
    },
  })

  if (!user) {
    // 记录登录失败审计日志（用户不存在）
    await audit(req, AuditAction.LOGIN_FAILED, 'user', {
      details: { identifier: id },
      success: false,
      errorMessage: '账号或密码错误',
      userId: null,
    })
    return fail(res, 401, '账号或密码错误')
  }

  const okPwd = await verifyPassword(password, user.passwordHash)
  if (!okPwd) {
    // 记录登录失败审计日志（密码错误）
    await audit(req, AuditAction.LOGIN_FAILED, 'user', {
      resourceId: user.id,
      details: { identifier: id },
      success: false,
      errorMessage: '账号或密码错误',
      userId: user.id,
    })
    return fail(res, 401, '账号或密码错误')
  }

  // 记录登录成功审计日志
  await audit(req, AuditAction.LOGIN, 'user', {
    resourceId: user.id,
    details: { identifier: id },
    success: true,
    userId: user.id,
  })

  const token = signToken(user.id)
  return ok(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.createdAt,
    },
  })
}

export async function me(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
  })
  if (!user) return fail(res, 401, '用户不存在')
  return ok(res, { user })
}


