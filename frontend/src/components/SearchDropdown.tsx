import { Clock, Search, X, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'

export type DropdownItem =
  | { type: 'shortcut'; id: string; name: string; url: string; favicon: string }
  | { type: 'suggestion'; text: string }
  | { type: 'history'; text: string }
  | { type: 'recent'; id: string; name: string; url: string; favicon: string | null }

interface ShortcutMatch {
  id: string
  name: string
  url: string
  favicon: string
}

interface RecentBookmark {
  id: string
  name: string
  url: string
  favicon: string | null
}

interface SearchDropdownProps {
  /** 是否可见 */
  isVisible: boolean
  /** 快捷方式匹配结果 */
  shortcuts: ShortcutMatch[]
  /** 搜索建议 */
  suggestions: string[]
  /** 搜索历史 */
  history: string[]
  /** 最近点击的书签 */
  recentBookmarks?: RecentBookmark[]
  /** 最近打开显示模式 */
  recentBookmarksMode?: 'fixed' | 'dynamic'
  /** 当前高亮索引，-1 表示无选中 */
  highlightIndex: number
  /** 是否正在加载建议 */
  isLoading?: boolean
  /** 每行高度（px） */
  rowHeight?: number
  /** 选择项目回调 */
  onSelectItem: (item: DropdownItem) => void
  /** 删除历史项回调 */
  onDeleteHistory: (text: string) => void
}

export function SearchDropdown({
  isVisible,
  shortcuts,
  suggestions,
  history,
  recentBookmarks = [],
  recentBookmarksMode = 'dynamic',
  highlightIndex,
  isLoading,
  rowHeight = 40,
  onSelectItem,
  onDeleteHistory,
}: SearchDropdownProps) {
  if (!isVisible) return null

  // 动态模式：计算能显示多少个书签
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(recentBookmarks.length)

  // 计算每个书签的预估宽度
  const estimateItemWidth = useCallback((name: string) => {
    // 图标 16px + gap 8px + padding 20px + 文字（每个字符约 8px，最大 120px）+ border 2px
    const textWidth = Math.min(name.length * 8, 120)
    return 16 + 8 + 20 + textWidth + 2 + 6 // 6px for gap
  }, [])

  // 监听容器宽度变化，计算能显示多少个
  useEffect(() => {
    if (recentBookmarksMode !== 'dynamic' || recentBookmarks.length === 0) {
      setVisibleCount(recentBookmarks.length)
      return
    }

    const container = containerRef.current
    if (!container) return

    const calculateVisibleCount = () => {
      const containerWidth = container.offsetWidth
      let totalWidth = 0
      let count = 0

      for (const bookmark of recentBookmarks) {
        const itemWidth = estimateItemWidth(bookmark.name)
        if (totalWidth + itemWidth > containerWidth) break
        totalWidth += itemWidth
        count++
      }

      setVisibleCount(Math.max(1, count)) // 至少显示 1 个
    }

    calculateVisibleCount()

    const observer = new ResizeObserver(calculateVisibleCount)
    observer.observe(container)

    return () => observer.disconnect()
  }, [recentBookmarks, recentBookmarksMode, estimateItemWidth])

  // 根据模式决定显示的书签
  const displayedRecentBookmarks = recentBookmarksMode === 'dynamic'
    ? recentBookmarks.slice(0, visibleCount)
    : recentBookmarks

  // 构建所有项目的扁平列表，用于键盘导航
  const allItems: DropdownItem[] = [
    ...recentBookmarks.map((b) => ({ type: 'recent' as const, ...b })),
    ...shortcuts.map((s) => ({ type: 'shortcut' as const, ...s })),
    ...suggestions.map((text) => ({ type: 'suggestion' as const, text })),
    ...history.map((text) => ({ type: 'history' as const, text })),
  ]

  const hasContent = allItems.length > 0 || isLoading
  if (!hasContent) return null

  let currentIndex = 0

  return (
    <div
      className={cn(
        'absolute left-0 right-0 top-full mt-2 z-50',
        'rounded-2xl border border-glass-border/20 backdrop-blur-xl shadow-glass',
        'bg-glass/75 overflow-hidden',
        'animate-in fade-in-0 slide-in-from-top-2 duration-200',
      )}
    >
      <div className="max-h-[320px] overflow-y-auto py-2">
        {/* 最近点击的书签区域 */}
        {recentBookmarks.length > 0 && (
          <div className="px-3 pb-2">
            <div className="text-[10px] text-fg/50 mb-1.5 px-1">最近打开</div>
            <div
              ref={containerRef}
              className={cn(
                'flex gap-1.5',
                recentBookmarksMode === 'dynamic' ? 'flex-nowrap' : 'flex-wrap'
              )}
            >
              {displayedRecentBookmarks.map((bookmark) => {
                const itemIndex = currentIndex++
                const isHighlighted = highlightIndex === itemIndex
                return (
                  <button
                    key={`recent-${bookmark.id}`}
                    type="button"
                    onClick={() => onSelectItem({ type: 'recent', ...bookmark })}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-xl shrink-0',
                      'text-sm transition-all duration-150',
                      'border',
                      isHighlighted
                        ? 'bg-primary/20 border-primary/30 text-fg'
                        : 'bg-glass/20 border-glass-border/10 text-fg/90 hover:bg-primary/15 hover:border-primary/20 hover:text-fg',
                    )}
                  >
                    {bookmark.favicon ? (
                      <img
                        src={bookmark.favicon}
                        alt=""
                        className="w-4 h-4 rounded-sm"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <ExternalLink className="w-4 h-4 text-fg/40" />
                    )}
                    <span className="truncate max-w-[120px]">{bookmark.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 分隔线 */}
        {recentBookmarks.length > 0 && (shortcuts.length > 0 || suggestions.length > 0 || history.length > 0) && (
          <div className="h-px bg-glass-border/10 mx-3 my-1" />
        )}

        {/* 快捷方式匹配区域 */}
        {shortcuts.length > 0 && (
          <div className="px-3 pb-2">
            <div className="text-[10px] text-fg/50 mb-1.5 px-1">快捷方式</div>
            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map((shortcut) => {
                const itemIndex = currentIndex++
                const isHighlighted = highlightIndex === itemIndex
                return (
                  <button
                    key={shortcut.id}
                    type="button"
                    onClick={() => onSelectItem({ type: 'shortcut', ...shortcut })}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-xl',
                      'text-sm transition-all duration-150',
                      'border',
                      isHighlighted
                        ? 'bg-primary/20 border-primary/30 text-fg'
                        : 'bg-glass/20 border-glass-border/10 text-fg/90 hover:bg-primary/15 hover:border-primary/20 hover:text-fg',
                    )}
                  >
                    {shortcut.favicon ? (
                      <img
                        src={shortcut.favicon}
                        alt=""
                        className="w-4 h-4 rounded-sm"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-sm bg-primary/20 flex items-center justify-center text-[10px] text-primary font-medium">
                        {shortcut.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate max-w-[120px]">{shortcut.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 分隔线 */}
        {shortcuts.length > 0 && (suggestions.length > 0 || history.length > 0) && (
          <div className="h-px bg-glass-border/10 mx-3 my-1" />
        )}

        {/* 搜索建议区域 */}
        {suggestions.length > 0 && (
          <div className="px-2 space-y-1">
            {suggestions.map((text) => {
              const itemIndex = currentIndex++
              const isHighlighted = highlightIndex === itemIndex
              return (
                <button
                  key={`suggestion-${text}`}
                  type="button"
                  onClick={() => onSelectItem({ type: 'suggestion', text })}
                  style={{ height: `${rowHeight}px` }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 text-left',
                    'text-sm transition-all duration-150',
                    'rounded-xl border',
                    isHighlighted
                      ? 'bg-primary/20 border-primary/30 text-fg'
                      : 'border-transparent text-fg/80 hover:bg-primary/10 hover:border-primary/20 hover:text-fg',
                  )}
                >
                  <Search className={cn(
                    'w-4 h-4 shrink-0 transition-colors',
                    isHighlighted ? 'text-primary' : 'text-fg/40',
                  )} />
                  <span className="truncate">{text}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 分隔线 */}
        {suggestions.length > 0 && history.length > 0 && (
          <div className="h-px bg-glass-border/10 mx-3 my-1" />
        )}

        {/* 搜索历史区域 */}
        {history.length > 0 && (
          <div className="px-2 space-y-1">
            {suggestions.length === 0 && shortcuts.length === 0 && (
              <div className="text-[10px] text-fg/50 px-2 py-1">搜索历史</div>
            )}
            {history.map((text) => {
              const itemIndex = currentIndex++
              const isHighlighted = highlightIndex === itemIndex
              return (
                <div
                  key={`history-${text}`}
                  style={{ height: `${rowHeight}px` }}
                  className={cn(
                    'group flex items-center gap-3 px-3',
                    'text-sm transition-all duration-150',
                    'rounded-xl border',
                    isHighlighted
                      ? 'bg-primary/20 border-primary/30 text-fg'
                      : 'border-transparent text-fg/80 hover:bg-primary/10 hover:border-primary/20 hover:text-fg',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem({ type: 'history', text })}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    <Clock className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      isHighlighted ? 'text-primary' : 'text-fg/40',
                    )} />
                    <span className="truncate">{text}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteHistory(text)
                    }}
                    className={cn(
                      'p-1 rounded-lg text-fg/30 hover:text-fg/60 hover:bg-glass/30',
                      'opacity-0 group-hover:opacity-100 transition-all',
                    )}
                    title="删除此记录"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && suggestions.length === 0 && (
          <div className="px-4 py-3 text-sm text-fg/50 text-center">
            正在获取建议...
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 获取所有项目的扁平列表（用于键盘导航）
 */
export function getAllDropdownItems(
  shortcuts: ShortcutMatch[],
  suggestions: string[],
  history: string[],
  recentBookmarks: RecentBookmark[] = []
): DropdownItem[] {
  return [
    ...recentBookmarks.map((b) => ({ type: 'recent' as const, ...b })),
    ...shortcuts.map((s) => ({ type: 'shortcut' as const, ...s })),
    ...suggestions.map((text) => ({ type: 'suggestion' as const, text })),
    ...history.map((text) => ({ type: 'history' as const, text })),
  ]
}
