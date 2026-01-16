import { ArrowRight, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppearanceStore } from '../stores/appearance'
import { useAuthStore } from '../stores/auth'
import { useSearchFocusStore } from '../stores/searchFocus'
import { apiFetch } from '../services/api'
import { cn } from '../utils/cn'
import { buildSearchUrl } from '../utils/searchEngine'
import { useSearchHistory } from '../hooks/useSearchHistory'
import { useSearchSuggestions } from '../hooks/useSearchSuggestions'
import { useShortcutMatcher, type Bookmark } from '../hooks/useShortcutMatcher'
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation'
import { useRecentBookmarks } from '../hooks/useRecentBookmarks'
import { useClickTracker } from '../hooks/useClickTracker'
import { SearchDropdown, getAllDropdownItems, type DropdownItem } from './SearchDropdown'

type Props = {
  className?: string
}

export function SearchBox({ className }: Props) {
  const [q, setQ] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 全局聚焦状态
  const setGlobalFocused = useSearchFocusStore((s) => s.setFocused)

  // 同步本地聚焦状态到全局
  useEffect(() => {
    setGlobalFocused(isFocused)
  }, [isFocused, setGlobalFocused])

  // 从 store 获取设置
  const searchEngine = useAppearanceStore((s) => s.searchEngine)
  const customSearchUrl = useAppearanceStore((s) => s.customSearchUrl)
  const searchHistoryCount = useAppearanceStore((s) => s.searchHistoryCount)
  const searchRowHeight = useAppearanceStore((s) => s.searchRowHeight)
  const recentBookmarksCount = useAppearanceStore((s) => s.recentBookmarksCount)
  const recentBookmarksEnabled = useAppearanceStore((s) => s.recentBookmarksEnabled)
  const recentBookmarksMode = useAppearanceStore((s) => s.recentBookmarksMode)
  const searchGlowBorder = useAppearanceStore((s) => s.searchGlowBorder)
  const searchGlowLight = useAppearanceStore((s) => s.searchGlowLight)
  const searchGlowLightMove = useAppearanceStore((s) => s.searchGlowLightMove)
  
  // 用户信息
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  // 搜索历史
  const { history, addToHistory, removeFromHistory } = useSearchHistory(user?.id)

  // 最近点击的书签（根据模式决定获取数量）
  const recentLimit = recentBookmarksMode === 'fixed' ? recentBookmarksCount : 12
  const { recentBookmarks } = useRecentBookmarks(recentLimit)
  
  // 点击追踪
  const { trackClick } = useClickTracker()

  // 搜索建议（仅在有输入时启用）
  const trimmedQuery = q.trim()
  const { suggestions, isLoading: suggestionsLoading } = useSearchSuggestions(
    trimmedQuery,
    searchEngine,
    isFocused && trimmedQuery.length > 0
  )

  // 快捷方式匹配
  const { matches: shortcuts } = useShortcutMatcher(trimmedQuery, bookmarks)

  // 构建下拉框项目列表
  const dropdownItems = useMemo(() => {
    if (!isFocused) return []
    
    // 有输入时显示快捷方式和建议（不显示最近书签）
    if (trimmedQuery) {
      return getAllDropdownItems(shortcuts, suggestions, [], [])
    }
    
    // 无输入时显示最近书签和历史
    const recentToShow = recentBookmarksEnabled ? recentBookmarks : []
    return getAllDropdownItems([], [], searchHistoryCount > 0 ? history : [], recentToShow)
  }, [isFocused, trimmedQuery, shortcuts, suggestions, history, searchHistoryCount, recentBookmarks, recentBookmarksEnabled])

  // 键盘导航
  const handleSelectItem = useCallback((index: number) => {
    const item = dropdownItems[index]
    if (!item) return
    handleItemSelect(item)
  }, [dropdownItems])

  const handleClose = useCallback(() => {
    setIsFocused(false)
    inputRef.current?.blur()
  }, [])

  const handleSubmit = useCallback(() => {
    executeSearch(q)
  }, [q])

  const { highlightIndex, resetHighlight, handleKeyDown } = useKeyboardNavigation({
    itemCount: dropdownItems.length,
    enabled: isFocused && dropdownItems.length > 0,
    onSelect: handleSelectItem,
    onClose: handleClose,
    onSubmit: handleSubmit,
  })

  // 加载书签数据
  useEffect(() => {
    if (!token) return
    
    const loadBookmarks = async () => {
      try {
        const resp = await apiFetch<{ items: Bookmark[] }>('/api/bookmarks', {
          method: 'GET',
          token,
        })
        if (resp.ok) {
          // 只保留 LINK 类型的书签
          setBookmarks(resp.data.items.filter(b => b.type === 'LINK'))
        }
      } catch {
        // 静默失败
      }
    }
    
    void loadBookmarks()
  }, [token])

  // 点击外部关闭下拉框
  useEffect(() => {
    if (!isFocused) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false)
      }
    }

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFocused])

  // 输入变化时重置高亮
  useEffect(() => {
    resetHighlight()
  }, [q, resetHighlight])

  // 执行搜索
  const executeSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      toast.warning('先输入点东西～')
      return
    }

    // 保存到历史记录
    addToHistory(trimmed)

    // 构建搜索 URL 并打开
    const url = buildSearchUrl(searchEngine, trimmed, customSearchUrl)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    // 清空输入并关闭下拉框
    setQ('')
    setIsFocused(false)
  }, [searchEngine, customSearchUrl, addToHistory])

  // 处理下拉框项目选择
  const handleItemSelect = useCallback((item: DropdownItem) => {
    if (item.type === 'shortcut' || item.type === 'recent') {
      // 打开快捷方式或最近书签
      window.open(item.url, '_blank', 'noopener,noreferrer')
      // 记录点击（会自动触发最近列表刷新）
      void trackClick(item.id)
      setQ('')
      setIsFocused(false)
    } else if (item.type === 'suggestion' || item.type === 'history') {
      // 执行搜索
      executeSearch(item.text)
    }
  }, [executeSearch, trackClick])

  // 处理删除历史
  const handleDeleteHistory = useCallback((text: string) => {
    removeFromHistory(text)
  }, [removeFromHistory])

  // 显示下拉框的条件
  const showDropdown = isFocused && (dropdownItems.length > 0 || suggestionsLoading)

  // 显示的历史记录（仅在无输入时）
  const displayHistory = !trimmedQuery && searchHistoryCount > 0 ? history : []

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex items-center transition-all duration-500 ease-out mx-auto',
        'h-12 rounded-2xl backdrop-blur-xl shadow-glass',
        // 边框：开启流光线条时用动画边框，否则用默认边框
        !searchGlowBorder && 'border border-glass-border/20',
        searchGlowBorder && 'glow-border',
        searchGlowBorder && isFocused && 'glow-border-active',
        // 光效：独立控制，不依赖流光线条
        searchGlowLight && isFocused && (searchGlowLightMove ? 'glow-light-move' : 'glow-light-static'),
        // z-index 确保下拉框在其他元素之上
        'z-40',
        // Initial State: Short, Low Opacity
        'w-64 bg-glass/15',
        // Hover State: Expand, Medium Opacity (only when not focused)
        'hover:w-[min(620px,90vw)] hover:bg-glass/40',
        // Focus State: Keep Expanded, High Opacity (almost opaque)
        // 开启流光边框时不显示 ring，用流光效果代替
        'focus-within:w-[min(620px,90vw)] focus-within:!bg-glass/75',
        !searchGlowBorder && 'focus-within:ring-2 focus-within:ring-primary/30',
        className,
      )}
    >
      <Search className="ml-4 h-5 w-5 text-fg/50 shrink-0" />

      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(e) => {
          // 先处理键盘导航
          handleKeyDown(e)
          
          // 如果没有高亮项且按下 Enter，执行搜索
          if (e.key === 'Enter' && highlightIndex < 0) {
            executeSearch(q)
          }
        }}
        placeholder="搜索点什么？"
        className="flex-1 min-w-0 bg-transparent border-none outline-none px-3 text-fg placeholder:text-fg/40 h-full text-base font-medium"
      />

      <button
        type="button"
        onClick={() => executeSearch(q)}
        className={cn(
          'mr-2 p-2 rounded-xl text-primary hover:bg-primary/10 active:bg-primary/20 transition-all duration-300',
          // Only show on focus
          'opacity-0 -translate-x-4 scale-75 pointer-events-none',
          'group-focus-within:opacity-100 group-focus-within:translate-x-0 group-focus-within:scale-100 group-focus-within:pointer-events-auto'
        )}
        aria-label="搜索"
      >
        <ArrowRight className="h-5 w-5" />
      </button>

      {/* 搜索下拉框 */}
      <SearchDropdown
        isVisible={showDropdown}
        shortcuts={trimmedQuery ? shortcuts : []}
        suggestions={trimmedQuery ? suggestions : []}
        history={displayHistory}
        recentBookmarks={!trimmedQuery && recentBookmarksEnabled ? recentBookmarks : []}
        recentBookmarksMode={recentBookmarksMode}
        highlightIndex={highlightIndex}
        isLoading={suggestionsLoading}
        rowHeight={searchRowHeight}
        onSelectItem={handleItemSelect}
        onDeleteHistory={handleDeleteHistory}
      />
    </div>
  )
}
