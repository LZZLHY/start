import type { Response } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../types/auth'
import { prisma } from '../prisma'
import { fail, ok } from '../utils/http'
import { hashPassword, verifyPassword } from '../services/auth'
import { readProjectSettings, writeProjectSettings } from '../services/projectSettings'
import { getHeatRanking } from '../services/clickStats'
import { getSiteDisplayName } from '../utils/siteNormalizer'

// --- Helpers ---

// Memory sort helper for custom role order
function compareRoles(roleA: string, roleB: string) {
  const order: Record<string, number> = { ROOT: 0, ADMIN: 1, USER: 2 }
  return (order[roleA] ?? 99) - (order[roleB] ?? 99)
}

// --- Handlers ---

export async function listUsers(req: AuthedRequest, res: Response) {
  const role = req.auth?.role
  if (!role) return fail(res, 401, '未登录')

  // Query Params
  const page = Math.max(1, parseInt(String(req.query.page || '1')))
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'))))
  const search = String(req.query.search || '').trim()
  const sortBy = String(req.query.sortBy || 'role_asc') // role_asc, created_desc, etc.

  // Build Where
  const where: any = {}
  if (role !== 'ROOT') {
    where.role = 'USER' // Admin sees only Users
  }
  if (search) {
    where.OR = [
      { username: { contains: search } }, // sqlite default is case-insensitive usually, but prisma might vary
      { nickname: { contains: search } },
    ]
  }

  // Fetch ALL matching (for memory sort & pagination relative to business logic)
  // Note: For massive scale, this needs SQL optimization. For now (<10k), memory sort is fine and allows complex role ordering.
  const allItems = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      nickname: true,
      role: true,
      createdAt: true,
      passwordHash: role === 'ROOT', // Only ROOT sees hashes
    },
  })

  // Sort in memory
  allItems.sort((a, b) => {
    // 1. Primary Sort
    if (sortBy === 'role_asc') {
      const rd = compareRoles(a.role, b.role)
      if (rd !== 0) return rd
      // Fallback: createdAt desc
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (sortBy === 'created_desc') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    if (sortBy === 'created_asc') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }
    // Default
    return 0
  })

  // Pagination in memory
  const total = allItems.length
  const start = (page - 1) * limit
  const items = allItems.slice(start, start + limit)

  return ok(res, {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function listBookmarks(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : ''

  const items = await prisma.bookmark.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(actor.role === 'ADMIN' ? { user: { role: 'USER' } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, username: true, nickname: true, role: true } },
    },
  })

  return ok(res, { items })
}

export async function deleteBookmarkAsAdmin(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const id = String(req.params.id || '').trim()
  if (!id) return fail(res, 400, '缺少书签 id')

  const item = await prisma.bookmark.findUnique({
    where: { id },
    select: { id: true, user: { select: { id: true, role: true } } },
  })
  if (!item) return fail(res, 404, '书签不存在')

  if (actor.role === 'ADMIN' && item.user.role !== 'USER') {
    return fail(res, 403, '无权限（管理员只能管理普通用户的数据）')
  }

  await prisma.bookmark.delete({ where: { id } })
  return ok(res, { id })
}

const UpdateBookmarkAsAdminSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().url().max(2048).optional().or(z.literal('')),
})

export async function updateBookmarkAsAdmin(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const id = String(req.params.id || '').trim()
  if (!id) return fail(res, 400, '缺少书签 id')

  const parsed = UpdateBookmarkAsAdminSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const item = await prisma.bookmark.findUnique({
    where: { id },
    select: { id: true, name: true, url: true, user: { select: { id: true, role: true } } },
  })
  if (!item) return fail(res, 404, '书签不存在')

  if (actor.role === 'ADMIN' && item.user.role !== 'USER') {
    return fail(res, 403, '无权限（管理员只能管理普通用户的数据）')
  }

  const updated = await prisma.bookmark.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.url !== undefined ? { url: parsed.data.url?.trim() || null } : {}),
    },
  })

  return ok(res, { item: updated })
}

export async function listExtensions(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const items = await prisma.extension.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      sourceUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, nickname: true, role: true } },
    },
  })

  return ok(res, { items })
}

const ReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
})

export async function reviewExtension(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const id = String(req.params.id || '').trim()
  if (!id) return fail(res, 400, '缺少插件 id')

  const parsed = ReviewSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const item = await prisma.extension.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  return ok(res, { item })
}

export async function getProjectSettings(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')
  const settings = await readProjectSettings()
  return ok(res, { settings })
}

export async function putProjectSettings(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')
  await writeProjectSettings(req.body ?? {})
  const settings = await readProjectSettings()
  return ok(res, { settings })
}

const UpdateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
})

export async function setUserRole(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const userId = String(req.params.id || '').trim()
  if (!userId) return fail(res, 400, '缺少用户 id')

  const parsed = UpdateRoleSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  if (userId === actor.userId) return fail(res, 400, '不能修改自己的角色')

  const existed = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!existed) return fail(res, 404, '用户不存在')
  if (existed.role === 'ROOT') return fail(res, 400, '不能修改初始管理员角色')

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
  })

  return ok(res, { user })
}

const ResetPasswordSchema = z.object({
  password: z.string().min(6).max(200),
})

export async function resetUserPassword(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const userId = String(req.params.id || '').trim()
  if (!userId) return fail(res, 400, '缺少用户 id')
  if (userId === actor.userId) return fail(res, 400, '不能在后台重置自己的密码')

  const parsed = ResetPasswordSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const existed = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!existed) return fail(res, 404, '用户不存在')
  if (existed.role === 'ROOT') return fail(res, 400, '不能重置初始管理员密码（请用 env 重新 seed）')

  const passwordHash = await hashPassword(parsed.data.password)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  return ok(res, { userId })
}

const UpdateRootProfileSchema = z.object({
  username: z.string().trim().min(3).max(32).optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  phone: z.string().trim().min(6).max(32).or(z.literal('')).optional(),
  nickname: z.string().trim().min(2).max(32).optional(),
})

export async function updateRootProfile(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const parsed = UpdateRootProfileSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const data = parsed.data
  const update: any = {}
  if (data.username !== undefined) update.username = data.username
  if (data.nickname !== undefined) update.nickname = data.nickname
  if (data.email !== undefined) update.email = data.email.trim() || null
  if (data.phone !== undefined) update.phone = data.phone.trim() || null

  try {
    const user = await prisma.user.update({
      where: { id: actor.userId },
      data: update,
      select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
    })
    return ok(res, { user })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '更新失败'
    if (msg.includes('Unique constraint')) return fail(res, 409, '账号/邮箱/手机号/昵称已被占用')
    return fail(res, 500, '更新失败')
  }
}

// ROOT Updating ANY user profile
export async function updateUserProfileAsRoot(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const userId = String(req.params.id || '').trim()
  if (!userId) return fail(res, 400, '缺少用户 id')

  const parsed = UpdateRootProfileSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  // Check target user
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!target) return fail(res, 404, '用户不存在')
  if (target.role === 'ROOT' && userId !== actor.userId) {
    return fail(res, 403, '不能修改其他 ROOT 管理员的资料')
  }

  const data = parsed.data
  const update: any = {}
  if (data.username !== undefined) update.username = data.username
  if (data.nickname !== undefined) update.nickname = data.nickname
  if (data.email !== undefined) update.email = data.email.trim() || null
  if (data.phone !== undefined) update.phone = data.phone.trim() || null

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: update,
      select: { id: true, username: true, email: true, phone: true, nickname: true, role: true, createdAt: true },
    })
    return ok(res, { user })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '更新失败'
    if (msg.includes('Unique constraint')) return fail(res, 409, '账号/邮箱/手机号/昵称已被占用')
    return fail(res, 500, '更新失败')
  }
}

const ChangeRootPasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
})

export async function changeRootPassword(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const parsed = ChangeRootPasswordSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')

  const me = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, passwordHash: true },
  })
  if (!me) return fail(res, 401, '用户不存在')

  const okPwd = await verifyPassword(parsed.data.oldPassword, me.passwordHash)
  if (!okPwd) return fail(res, 401, '原密码不正确')

  const passwordHash = await hashPassword(parsed.data.newPassword)
  await prisma.user.update({ where: { id: actor.userId }, data: { passwordHash } })
  return ok(res, { ok: true })
}

/** 获取服务器状态（启动时长等） */
export async function getServerStatus(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const startTime = (global as any).__SERVER_START_TIME__ || Date.now()
  const startupDuration = (global as any).__SERVER_STARTUP_DURATION__ || 0
  const uptime = Date.now() - startTime

  // 格式化运行时长
  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}天 ${hours % 24}小时 ${minutes % 60}分钟`
    }
    if (hours > 0) {
      return `${hours}小时 ${minutes % 60}分钟 ${seconds % 60}秒`
    }
    if (minutes > 0) {
      return `${minutes}分钟 ${seconds % 60}秒`
    }
    return `${seconds}秒`
  }

  return ok(res, {
    startTime: new Date(startTime).toISOString(),
    startupDuration: `${startupDuration}ms`,
    uptime: formatUptime(uptime),
    uptimeMs: uptime,
  })
}


/**
 * 获取管理员书签统计
 * 返回按用户分组的书签统计，包含每个书签的点击数
 */
export async function getAdminBookmarkStats(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  // 获取所有用户（根据权限过滤）
  const users = await prisma.user.findMany({
    where: actor.role === 'ADMIN' ? { role: 'USER' } : {},
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
    },
  })

  // 按角色排序：ROOT > ADMIN > USER
  const roleOrder: Record<string, number> = { ROOT: 0, ADMIN: 1, USER: 2 }
  users.sort((a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99))

  // 获取所有书签
  const bookmarks = await prisma.bookmark.findMany({
    where: actor.role === 'ADMIN' ? { user: { role: 'USER' } } : {},
    select: {
      id: true,
      name: true,
      url: true,
      type: true,
      parentId: true,
      userId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // 获取所有点击统计
  const clickStats = await prisma.clickStat.findMany({
    select: {
      userId: true,
      siteId: true,
      clickCount: true,
    },
  })

  // 构建 siteId -> 全局点击数 映射
  const globalClickMap = new Map<string, number>()
  for (const stat of clickStats) {
    const current = globalClickMap.get(stat.siteId) ?? 0
    globalClickMap.set(stat.siteId, current + stat.clickCount)
  }

  // 构建 userId:siteId -> 用户点击数 映射
  const userClickMap = new Map<string, number>()
  for (const stat of clickStats) {
    userClickMap.set(`${stat.userId}:${stat.siteId}`, stat.clickCount)
  }

  // 从 URL 提取 siteId
  const getSiteIdFromUrl = (url: string | null): string | null => {
    if (!url) return null
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.hostname}`
    } catch {
      return null
    }
  }

  // 按用户分组书签
  const userStats = users.map(user => {
    const userBookmarks = bookmarks.filter(b => b.userId === user.id)
    
    // 计算用户总点击数
    let totalClicks = 0
    const bookmarksWithStats = userBookmarks.map(bookmark => {
      const siteId = getSiteIdFromUrl(bookmark.url)
      const userClicks = siteId ? (userClickMap.get(`${user.id}:${siteId}`) ?? 0) : 0
      const globalClicks = siteId ? (globalClickMap.get(siteId) ?? 0) : 0
      totalClicks += userClicks
      
      return {
        ...bookmark,
        siteId,
        userClicks,
        globalClicks,
      }
    })

    return {
      user,
      bookmarkCount: userBookmarks.length,
      totalClicks,
      bookmarks: bookmarksWithStats,
    }
  })

  return ok(res, { userStats })
}

/**
 * 获取热力榜单
 * 返回全局点击量 Top N 站点
 */
export async function getAdminHeatRanking(req: AuthedRequest, res: Response) {
  const actor = req.auth
  if (!actor) return fail(res, 401, '未登录')
  if (actor.role !== 'ADMIN' && actor.role !== 'ROOT') return fail(res, 403, '无权限')

  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'))))
  
  const ranking = await getHeatRanking(limit)

  return ok(res, { ranking })
}
