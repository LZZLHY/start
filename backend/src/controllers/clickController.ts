/**
 * 点击统计控制器
 * 处理书签点击记录和统计查询的 HTTP 请求
 */

import type { Response } from 'express'
import type { AuthedRequest } from '../types/auth'
import { prisma } from '../prisma'
import { fail, ok } from '../utils/http'
import { getSiteIdFromUrl } from '../utils/siteNormalizer'
import { recordClick, getUserStats, getGlobalStats } from '../services/clickStats'

/**
 * POST /api/bookmarks/:id/click
 * 记录书签点击
 */
export async function recordBookmarkClick(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')
  
  const bookmarkId = String(req.params.id || '').trim()
  if (!bookmarkId) return fail(res, 400, '缺少书签 ID')
  
  // 获取书签信息
  const bookmark = await prisma.bookmark.findFirst({
    where: { id: bookmarkId, userId },
    select: { id: true, url: true, type: true },
  })
  
  if (!bookmark) return fail(res, 404, '书签不存在')
  
  // 只有 LINK 类型的书签才记录点击
  if (bookmark.type !== 'LINK' || !bookmark.url) {
    return fail(res, 400, '该书签类型不支持点击统计')
  }
  
  // 规范化 URL 为站点标识符
  const siteId = getSiteIdFromUrl(bookmark.url)
  if (!siteId) {
    return fail(res, 400, '无效的书签 URL')
  }
  
  // 记录点击
  const record = await recordClick(userId, siteId)
  
  // 获取全局统计
  const globalStats = await getGlobalStats(siteId)
  
  return ok(res, {
    siteId,
    userClicks: record.clickCount,
    globalClicks: globalStats.globalClicks,
  })
}

/**
 * GET /api/bookmarks/stats
 * 获取当前用户的点击统计
 */
export async function getUserClickStats(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')
  
  const { stats } = await getUserStats(userId)
  
  return ok(res, { stats })
}
