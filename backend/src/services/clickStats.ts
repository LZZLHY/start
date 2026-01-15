/**
 * 点击统计服务
 * 管理书签点击的记录和查询
 */

import { prisma } from '../prisma'
import { getSiteIdFromUrl, getSiteDisplayName } from '../utils/siteNormalizer'

export interface ClickStatRecord {
  id: string
  userId: string
  siteId: string
  clickCount: number
  lastClickAt: Date
}

export interface UserClickStats {
  /** siteId -> clickCount */
  stats: Record<string, number>
}

export interface GlobalSiteStats {
  siteId: string
  siteName: string
  globalClicks: number
  uniqueUsers: number
}

export interface HeatRankingItem {
  siteId: string
  siteName: string
  globalClicks: number
  uniqueUsers: number
}

/**
 * 记录一次点击
 * 使用 upsert 确保原子性递增
 * 
 * @param userId - 用户 ID
 * @param siteId - 规范化的站点标识符
 * @returns 更新后的统计记录
 */
export async function recordClick(userId: string, siteId: string): Promise<ClickStatRecord> {
  const record = await prisma.clickStat.upsert({
    where: {
      userId_siteId: { userId, siteId }
    },
    create: {
      userId,
      siteId,
      clickCount: 1,
      lastClickAt: new Date(),
    },
    update: {
      clickCount: { increment: 1 },
      lastClickAt: new Date(),
    },
  })
  
  return record
}

/**
 * 获取用户的所有站点点击统计
 * 
 * @param userId - 用户 ID
 * @returns 站点点击统计映射
 */
export async function getUserStats(userId: string): Promise<UserClickStats> {
  const records = await prisma.clickStat.findMany({
    where: { userId },
    select: {
      siteId: true,
      clickCount: true,
    },
  })
  
  const stats: Record<string, number> = {}
  for (const record of records) {
    stats[record.siteId] = record.clickCount
  }
  
  return { stats }
}

/**
 * 获取特定站点的全局统计
 * 
 * @param siteId - 站点标识符
 * @returns 全局统计数据
 */
export async function getGlobalStats(siteId: string): Promise<GlobalSiteStats> {
  const aggregation = await prisma.clickStat.aggregate({
    where: { siteId },
    _sum: { clickCount: true },
    _count: { userId: true },
  })
  
  return {
    siteId,
    siteName: getSiteDisplayName(siteId),
    globalClicks: aggregation._sum.clickCount ?? 0,
    uniqueUsers: aggregation._count.userId ?? 0,
  }
}

/**
 * 获取热力榜单
 * 返回全局点击量最高的站点列表
 * 
 * @param limit - 返回数量，默认 20
 * @returns 热力榜单
 */
export async function getHeatRanking(limit: number = 20): Promise<HeatRankingItem[]> {
  // 按站点聚合统计
  const aggregations = await prisma.clickStat.groupBy({
    by: ['siteId'],
    _sum: { clickCount: true },
    _count: { userId: true },
    orderBy: [
      { _sum: { clickCount: 'desc' } },
      { _count: { userId: 'desc' } },
    ],
    take: limit,
  })
  
  return aggregations.map(agg => ({
    siteId: agg.siteId,
    siteName: getSiteDisplayName(agg.siteId),
    globalClicks: agg._sum.clickCount ?? 0,
    uniqueUsers: agg._count.userId ?? 0,
  }))
}

/**
 * 根据书签 URL 记录点击
 * 这是一个便捷方法，自动处理 URL 规范化
 * 
 * @param userId - 用户 ID
 * @param bookmarkUrl - 书签的原始 URL
 * @returns 更新后的统计记录，如果 URL 无效则返回 null
 */
export async function recordClickByUrl(userId: string, bookmarkUrl: string): Promise<ClickStatRecord | null> {
  const siteId = getSiteIdFromUrl(bookmarkUrl)
  if (!siteId) return null
  
  return recordClick(userId, siteId)
}

/**
 * 获取用户对特定站点的点击次数
 * 
 * @param userId - 用户 ID
 * @param siteId - 站点标识符
 * @returns 点击次数，如果没有记录则返回 0
 */
export async function getUserClickCount(userId: string, siteId: string): Promise<number> {
  const record = await prisma.clickStat.findUnique({
    where: {
      userId_siteId: { userId, siteId }
    },
    select: { clickCount: true },
  })
  
  return record?.clickCount ?? 0
}
