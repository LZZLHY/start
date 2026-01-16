/**
 * 最近点击书签 Hook
 * 获取用户最近点击打开的书签列表
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'

export interface RecentBookmark {
  id: string
  name: string
  url: string
  favicon: string | null
  lastClickAt: string
}

/** 从 URL 生成 favicon URL */
function getFaviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return ''
  }
}

/** 全局事件：书签被点击时触发 */
const BOOKMARK_CLICKED_EVENT = 'bookmark-clicked'

/** 触发书签点击事件（供其他组件调用） */
export function emitBookmarkClicked() {
  window.dispatchEvent(new CustomEvent(BOOKMARK_CLICKED_EVENT))
}

export function useRecentBookmarks(limit: number = 8) {
  const token = useAuthStore((s) => s.token)
  const [recentBookmarks, setRecentBookmarks] = useState<RecentBookmark[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setRecentBookmarks([])
      return
    }
    
    setLoading(true)
    try {
      const resp = await apiFetch<{ items: RecentBookmark[] }>(
        `/api/bookmarks/recent?limit=${limit}`,
        { method: 'GET', token }
      )
      if (resp.ok) {
        // 为每个书签生成 favicon URL
        const items = resp.data.items.map(item => ({
          ...item,
          favicon: item.favicon || getFaviconUrl(item.url),
        }))
        setRecentBookmarks(items)
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [token, limit])

  // 初始加载
  useEffect(() => {
    void refresh()
  }, [refresh])

  // 监听全局书签点击事件
  useEffect(() => {
    const handleBookmarkClicked = () => {
      // 延迟刷新，等待后端记录完成
      setTimeout(() => void refresh(), 300)
    }
    window.addEventListener(BOOKMARK_CLICKED_EVENT, handleBookmarkClicked)
    return () => window.removeEventListener(BOOKMARK_CLICKED_EVENT, handleBookmarkClicked)
  }, [refresh])

  return {
    recentBookmarks,
    loading,
    refresh,
  }
}
