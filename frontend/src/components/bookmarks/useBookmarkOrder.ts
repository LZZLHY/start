import { useEffect, useMemo, useRef, useState } from 'react'
import { getOrder, saveOrder } from './orderStorage'
import { applySortMode } from '../../utils/sortBookmarks'
import { useAppearanceStore } from '../../stores/appearance'
import type { BookmarkContext, BookmarkItem, SortMode } from '../../types/bookmark'

// 本地定义类型，避免导入问题
type BookmarkItemWithUrl = BookmarkItem & { url?: string | null }

export function useBookmarkOrder(args: {
  userId: string | null | undefined
  folderId: string | null
  itemIds: string[]
  items?: BookmarkItem[]
  itemsWithUrl?: BookmarkItemWithUrl[]
  context?: BookmarkContext
  sortMode?: SortMode
  clickCounts?: Record<string, number>
  urlToSiteId?: (url: string) => string | null
}) {
  const { 
    userId, 
    folderId, 
    itemIds, 
    items = [], 
    itemsWithUrl,
    context = 'shortcut', 
    sortMode: sortModeOverride,
    clickCounts,
    urlToSiteId,
  } = args
  const [order, setOrder] = useState<string[]>([])
  const lastKeyRef = useRef<string>('')
  
  // 从 store 获取排序模式（仅书签页使用），可被参数覆盖
  const storeSortMode = useAppearanceStore((s) => s.bookmarkDrawerSortMode)
  const sortMode = sortModeOverride ?? storeSortMode

  // 初始化/切换文件夹时，从 localStorage 读一次，然后"补齐缺失/剔除不存在"
  useEffect(() => {
    if (!userId) {
      setOrder(itemIds)
      return
    }
    const key = `${userId}:${folderId ?? 'root'}:${context}`
    if (lastKeyRef.current === key && order.length) return
    lastKeyRef.current = key

    const persisted = getOrder(userId, folderId, context)
    const set = new Set(persisted)
    const extras = itemIds.filter((id) => !set.has(id))
    const next = [...persisted.filter((id) => itemIds.includes(id)), ...extras]
    setOrder(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, folderId, itemIds.join('|'), context])

  // 计算自定义顺序（用于排序）
  const customOrder = useMemo(() => {
    const set = new Set(itemIds)
    const filtered = order.filter((id) => set.has(id))
    const exist = new Set(filtered)
    const extras = itemIds.filter((id) => !exist.has(id))
    return [...filtered, ...extras]
  }, [itemIds, order])

  // 计算最终显示顺序
  // 使用 JSON.stringify 确保 clickCounts 变化时能触发重新计算
  const clickCountsKey = clickCounts ? JSON.stringify(clickCounts) : ''
  // 使用 items 的 id 列表作为稳定的依赖键
  const itemsKey = items.map(i => i.id).join(',')
  // 使用 itemsWithUrl 的 id 列表作为稳定的依赖键
  const itemsWithUrlKey = itemsWithUrl ? itemsWithUrl.map(i => i.id).join(',') : ''
  const visibleIds = useMemo(() => {
    // 快捷栏始终使用自定义顺序
    if (context === 'shortcut') {
      return customOrder
    }
    
    // 书签页根据排序模式决定
    if (items.length === 0) {
      return customOrder
    }
    
    return applySortMode(items, customOrder, sortMode, {
      clickCounts,
      urlToSiteId,
      itemsWithUrl,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, customOrder, itemsKey, sortMode, clickCountsKey, urlToSiteId, itemsWithUrlKey])

  const persist = (next: string[], targetContext?: BookmarkContext) => {
    if (!userId) return
    saveOrder(userId, folderId, next, targetContext ?? context)
  }

  const appendToEnd = (id: string) => {
    const base = customOrder.filter((x) => x !== id)
    const next = [...base, id]
    setOrder(next)
    persist(next)
  }

  const replaceId = (fromId: string, toId: string) => {
    const base = customOrder.filter((x) => x !== fromId && x !== toId)
    const idx = customOrder.indexOf(fromId)
    const next = idx >= 0 ? [...base.slice(0, idx), toId, ...base.slice(idx)] : [...base, toId]
    setOrder(next)
    persist(next)
  }

  return {
    order,
    setOrder,
    visibleIds,
    customOrder,
    persist,
    appendToEnd,
    replaceId,
  }
}
