import type { Response } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../types/auth'
import { prisma } from '../prisma'
import { fail, ok } from '../utils/http'
import { hashPassword, verifyPassword } from '../services/auth'

const UpdateNicknameSchema = z.object({
  nickname: z.string().trim().min(2).max(32),
})

const UpdateProfileSchema = z.object({
  username: z.string().trim().min(3).max(32).optional(),
  nickname: z.string().trim().min(2).max(32).optional(),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  phone: z.union([z.string().trim().min(6).max(32), z.literal(''), z.null()]).optional(),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
})

export async function updateMyNickname(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')

  const parsed = UpdateNicknameSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { nickname: parsed.data.nickname },
      select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
    })
    return ok(res, { user })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '更新失败'
    if (msg.includes('Unique constraint')) return fail(res, 409, '昵称已被占用')
    return fail(res, 500, '更新失败')
  }
}

export async function updateMyProfile(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')

  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const { username, nickname, email, phone } = parsed.data

  // 构建更新数据，只包含提供的字段
  const updateData: Record<string, string | null> = {}
  if (username !== undefined) updateData.username = username
  if (nickname !== undefined) updateData.nickname = nickname
  if (email !== undefined) updateData.email = email || null
  if (phone !== undefined) updateData.phone = phone || null

  if (Object.keys(updateData).length === 0) {
    return fail(res, 400, '没有要更新的字段')
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
    })
    return ok(res, { user })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '更新失败'
    if (msg.includes('Unique constraint')) return fail(res, 409, '账号/邮箱/手机号/昵称已被占用')
    return fail(res, 500, '更新失败')
  }
}

export async function changeMyPassword(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')

  const parsed = ChangePasswordSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const { currentPassword, newPassword } = parsed.data

  try {
    // 获取当前用户的密码哈希
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    })
    if (!user) return fail(res, 401, '用户不存在')

    // 验证当前密码
    const isValid = await verifyPassword(currentPassword, user.passwordHash)
    if (!isValid) return fail(res, 401, '当前密码错误')

    // 更新密码
    const newHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })

    return ok(res, { message: '密码修改成功' })
  } catch (e: any) {
    return fail(res, 500, '密码修改失败')
  }
}


