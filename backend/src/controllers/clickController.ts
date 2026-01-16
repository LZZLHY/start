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

/**
 * GET /api/bookmarks/recent
 * 获取当前用户最近点击的书签
 */
export async function getRecentClickedBookmarks(req: AuthedRequest, res: Response) {
  try {
    const userId = req.auth?.userId
    if (!userId) return fail(res, 401, '未登录')
    
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 8, 1), 20)
    
    // 获取最近点击的站点记录
    const recentClicks = await prisma.clickStat.findMany({
      where: { userId },
      orderBy: { lastClickAt: 'desc' },
      take: limit,
      select: {
        siteId: true,
        lastClickAt: true,
      },
    })
    
    if (recentClicks.length === 0) {
      return ok(res, { items: [] })
    }
    
    // 获取用户的书签，匹配这些站点
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId,
        type: 'LINK',
        url: { not: null },
      },
      select: {
        id: true,
        name: true,
        url: true,
      },
    })
    
    // 按 siteId 匹配书签
    const siteIdToBookmark = new Map<string, typeof bookmarks[0]>()
    const bookmarkSiteIds: { url: string; siteId: string | null }[] = []
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        const siteId = getSiteIdFromUrl(bookmark.url)
        bookmarkSiteIds.push({ url: bookmark.url, siteId })
        if (siteId && !siteIdToBookmark.has(siteId)) {
          siteIdToBookmark.set(siteId, bookmark)
        }
      }
    }
    
    // 按最近点击顺序返回书签
    const items = recentClicks
      .map(click => {
        const bookmark = siteIdToBookmark.get(click.siteId)
        if (!bookmark) return null
        return {
          id: bookmark.id,
          name: bookmark.name,
          url: bookmark.url,
          lastClickAt: click.lastClickAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
    
    return ok(res, { items })
  } catch (error) {
    console.error('[getRecentClickedBookmarks] Error:', error)
    return fail(res, 500, '获取最近书签失败')
  }
}
