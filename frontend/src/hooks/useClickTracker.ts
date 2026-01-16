/**
 * 点击追踪 Hook
 * 用于记录书签点击和获取点击统计
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { emitBookmarkClicked } from './useRecentBookmarks'

export interface ClickStats {
  /** siteId -> clickCount */
  stats: Record<string, number>
}

/**
 * 从 URL 提取规范化的站点标识符
 * 与后端 siteNormalizer 保持一致
 */
export function getSiteIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    // 只保留协议和主机名（包含子域名）
    return `${parsed.protocol}//${parsed.hostname}`
  } catch {
    return null
  }
}

export function useClickTracker() {
  const token = useAuthStore((s) => s.token)
  const [clickStats, setClickStats] = useState<ClickStats>({ stats: {} })
  const [loading, setLoading] = useState(false)

  /**
   * 刷新点击统计
   */
  const refreshStats = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await apiFetch<ClickStats>('/api/bookmarks/stats', {
        method: 'GET',
        token,
      })
      if (resp.ok) {
        setClickStats(resp.data)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  /**
   * 记录书签点击
   * @returns Promise，点击记录完成后 resolve
   */
  const trackClick = useCallback(async (bookmarkId: string): Promise<void> => {
    if (!token) return
    try {
      const resp = await apiFetch(`/api/bookmarks/${bookmarkId}/click`, {
        method: 'POST',
        token,
      })
      if (resp.ok) {
        // 更新本地统计（乐观更新）
        const data = resp.data as { siteId: string; userClicks: number }
        setClickStats((prev) => ({
          stats: {
            ...prev.stats,
            [data.siteId]: data.userClicks,
          },
        }))
        // 触发全局事件，通知最近书签列表刷新
        emitBookmarkClicked()
      }
    } catch {
      // 静默失败，不影响用户体验
    }
  }, [token])

  /**
   * 获取特定站点的点击次数
   */
  const getClickCount = useCallback((url: string): number => {
    const siteId = getSiteIdFromUrl(url)
    if (!siteId) return 0
    return clickStats.stats[siteId] ?? 0
  }, [clickStats])

  // 初始加载
  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  return {
    clickStats,
    loading,
    trackClick,
    refreshStats,
    getClickCount,
    getSiteIdFromUrl,
  }
}
