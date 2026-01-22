import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Folder, X } from 'lucide-react'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useBookmarkDndStore } from '../stores/bookmarkDnd'
import { useAppearanceStore } from '../stores/appearance'
import { cn } from '../utils/cn'
import { normalizeUrl } from '../utils/url'
import { Favicon } from './Favicon'
import { SearchBox } from './SearchBox'
import { SortModeSelector } from './SortModeSelector'
import { useTitleFetch } from '../hooks/useTitleFetch'
import { useClickTracker, getSiteIdFromUrl } from '../hooks/useClickTracker'
import { useIsMobile } from '../hooks/useIsMobile'

// 从 bookmarks 模块导入共享组件和工具
import {
  type Bookmark,
  type BookmarkType,
  type MenuState,
  DrawerBookmarkItem,
  DrawerContextMenu,
  DrawerDeleteDialog,
  DrawerCreateDialog,
  DrawerEditDialog,
  DrawerSavePromptDialog,
  DrawerLoginPrompt,
  FolderModal,
  useLazyVisibility,
  useBookmarkOrder,
  useBookmarkDrag,
  useShortcutSet,
  useSwipeDown,
  getOrder,
  saveOrder,
  updateOrderAfterCreateFolder,
  getSortedFolderChildren,
} from './bookmarks'

// --- Types ---

// --- Props ---

type BookmarkDrawerProps = {
  open: boolean
  onClose: () => void
  swipeUpProgress?: number
  isSwipeAnimating?: boolean // 是否正在执行返回动画
}

export function BookmarkDrawer({ open, onClose, swipeUpProgress = 0, isSwipeAnimating = false }: BookmarkDrawerProps) {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()
  
  // 排序设置
  const sortMode = useAppearanceStore((s) => s.bookmarkDrawerSortMode)
  const setSortMode = useAppearanceStore((s) => s.setBookmarkDrawerSortMode)
  const sortLocked = useAppearanceStore((s) => s.bookmarkSortLocked)

  // --- Shortcut Set ---
  const {
    addShortcut,
    removeShortcut,
    isShortcut,
    isFull,
  } = useShortcutSet(user?.id)

  // --- Click Tracker ---
  const { clickStats, trackClick, refreshStats: refreshClickStats } = useClickTracker()

  // --- State ---
  const [allItems, setAllItems] = useState<Bookmark[]>([])
  const [, setLoading] = useState(false)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderOriginRect, setFolderOriginRect] = useState<DOMRect | null>(null)
  
  // Animation state - 用于控制进入/退出动画
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const wasSwipedOpen = useRef(false)
  const justClosed = useRef(false) // 标记是否刚刚关闭，防止闪屏
  const closedViaSwipe = useRef(false) // 标记是否通过下划关闭
  const lastDragEndTimeGlobal = useRef(0) // 记录拖拽结束时间，用于防止拖拽结束后立即触发关闭

  // 下滑关闭手势
  const swipeDown = useSwipeDown({
    threshold: 120,
    onClose,
    lastDragEndTimeRef: lastDragEndTimeGlobal,
    closedViaSwipeRef: closedViaSwipe,
  })
  
  // 订阅全局拖拽状态变化，在拖拽结束时记录时间（放在 handlePopState 之前）
  const globalIsDraggingEarly = useBookmarkDndStore((s) => s.isDragging)
  const wasDraggingRef = useRef(false) // 记录上一次的拖拽状态，用于检测从 true 变为 false
  useEffect(() => {
    // 只有从 true 变为 false 时才记录时间（真正的拖拽结束）
    if (wasDraggingRef.current && !globalIsDraggingEarly) {
      lastDragEndTimeGlobal.current = Date.now()
    }
    wasDraggingRef.current = globalIsDraggingEarly
  }, [globalIsDraggingEarly])
  
  // 记录是否通过上划打开（用于跳过开场动画）
  // 同时在新的上划开始时重置 justClosed 标记
  useEffect(() => {
    if (swipeUpProgress > 0 && !open) {
      justClosed.current = false // 新的上划开始，重置关闭标记
    }
    if (swipeUpProgress >= 0.9 && !open) {
      wasSwipedOpen.current = true
    }
  }, [swipeUpProgress, open])
  
  // 处理进入/退出动画
  useEffect(() => {
    if (open) {
      setShouldRender(true)
      closedViaSwipe.current = false
      justClosed.current = false // 打开时重置
      // 如果是通过上划打开的，立即显示，跳过动画（因为上划预览已经显示了）
      if (wasSwipedOpen.current) {
        setIsVisible(true)
        wasSwipedOpen.current = false
      } else {
        // 点击时钟或其他方式打开，延迟设置 isVisible 确保 DOM 已渲染
        const timer = setTimeout(() => {
          setIsVisible(true)
        }, 50)
        return () => clearTimeout(timer)
      }
    } else {
      setIsVisible(false)
      wasSwipedOpen.current = false
      justClosed.current = true // 标记刚刚关闭
      // 如果是通过下滑关闭的，立即卸载，跳过退出动画
      if (closedViaSwipe.current) {
        setShouldRender(false)
        setSwipeDownProgress(0) // 重置进度
        closedViaSwipe.current = false
        return
      }
      // 等待退出动画完成后再卸载组件
      const timer = setTimeout(() => {
        setShouldRender(false)
        justClosed.current = false
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  // 安卓返回键/手势拦截：打开时 push history state，返回时关闭抽屉而不是退出页面
  useEffect(() => {
    if (!open) return

    // 打开时推入一个 history 状态
    const state = { bookmarkDrawerOpen: true }
    window.history.pushState(state, '')

    const handlePopState = () => {
      // 如果正在拖拽书签或刚刚结束拖拽，忽略 popstate 事件
      if (useBookmarkDndStore.getState().isDragging || Date.now() - lastDragEndTimeGlobal.current < 300) {
        // 重新推入 history 状态，防止意外退出
        window.history.pushState({ bookmarkDrawerOpen: true }, '')
        return
      }
      // 用户按了返回键，使用下滑动画关闭（不设置 closedViaSwipe，保留退出动画）
      setIsSwipeDownAnimating(true)
      setSwipeDownProgress(1)
      setTimeout(() => {
        setIsSwipeDownAnimating(false)
        onClose()
      }, 300)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // 清理：如果抽屉仍然打开状态被卸载，需要回退 history
      if (window.history.state?.bookmarkDrawerOpen) {
        window.history.back()
      }
    }
  }, [open, onClose])

  // UI States
  const [menu, setMenu] = useState<MenuState>({ open: false })
  const [menuClosing, setMenuClosing] = useState(false) // 控制关闭动画
  const menuOpenTime = useRef(0) // 记录菜单打开时间，用于防止触摸模拟的 click 立即关闭菜单

  // 关闭菜单时先播放动画再移除
  const closeMenu = useCallback(() => {
    setMenuClosing(true)
    setTimeout(() => {
      setMenu({ open: false })
      setMenuClosing(false)
    }, 120) // 动画时长
  }, [])

  // 从 useSwipeDown hook 解构需要的值
  const {
    swipeDownProgress,
    isSwipeDownAnimating,
    setSwipeDownProgress,
    setIsSwipeDownAnimating,
    scrollContainerRef,
    contentRef,
    handleSwipeEnd,
  } = swipeDown

  // --- Drag state ---
  const itemElsRef = useRef(new Map<string, HTMLDivElement>())
  const setElRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) itemElsRef.current.set(id, el)
    else itemElsRef.current.delete(id)
  }, [])
  const getEl = useCallback((id: string) => itemElsRef.current.get(id), [])
  const dndPrePush = useBookmarkDndStore((s) => s.prePush)
  const dndPushAnim = useBookmarkDndStore((s) => s.pushAnimation)
  const dndDropAnim = useBookmarkDndStore((s) => s.dropAnimation)

  // Dialogs
  const [editOpen, setEditOpen] = useState(false)
  const [editClosing, setEditClosing] = useState(false)
  const [editItem, setEditItem] = useState<Bookmark | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editIconUrl, setEditIconUrl] = useState('')
  const [editIconPreviewError, setEditIconPreviewError] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleteItem, setDeleteItem] = useState<Bookmark | null>(null)
  const [deleteMode, setDeleteMode] = useState<'release' | 'delete'>('delete')

  const [createOpen, setCreateOpen] = useState(false)
  const [createClosing, setCreateClosing] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [createType, setCreateType] = useState<BookmarkType>('LINK')
  const [createName, setCreateName] = useState('')
  const [createUrl, setCreateUrl] = useState('')
  const [createNote, setCreateNote] = useState('')
  const [createTags, setCreateTags] = useState<string[]>([])
  const [createNameSource, setCreateNameSource] = useState<'user' | 'auto' | 'none'>('none')

  // 登录提示模态框
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)

  // Escape 键关闭 - 优先关闭内部弹窗，再关闭抽屉
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 优先关闭内部弹窗
        if (editOpen) {
          setEditOpen(false)
        } else if (deleteOpen) {
          setDeleteOpen(false)
        } else if (createOpen) {
          setCreateOpen(false)
        } else if (loginPromptOpen) {
          setLoginPromptOpen(false)
        } else {
          // 没有内部弹窗时才关闭抽屉
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, editOpen, deleteOpen, createOpen, loginPromptOpen])

  const [customIconOk, setCustomIconOk] = useState<Record<string, boolean>>({})
  
  // All tags for autocomplete
  const [allTags, setAllTags] = useState<string[]>([])
  
  // Selected tag for filtering
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // --- Title Fetch ---
  const titleFetch = useTitleFetch()
  
  // 当标题获取成功时，自动填充名称（仅当名称来源不是用户输入时）
  useEffect(() => {
    if (createNameSource === 'none' && !titleFetch.loading && (titleFetch.title || titleFetch.fallback)) {
      const newName = titleFetch.title || titleFetch.fallback || ''
      if (newName && !createName) {
        setCreateName(newName)
        setCreateNameSource('auto')
      }
    }
  }, [titleFetch.title, titleFetch.fallback, titleFetch.loading, createNameSource, createName])

  // 非自定义模式拖拽保存提示
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)
  const [originalOrder, setOriginalOrder] = useState<string[] | null>(null)

  // --- Computed ---
  const availableFolders = useMemo(() => {
    return allItems.filter(x => x.type === 'FOLDER' && x.id !== activeFolderId)
  }, [allItems, activeFolderId])

  // 书签页始终显示根目录书签，文件夹内容通过 FolderModal 显示
  const currentItems = useMemo(() => {
    return allItems.filter((x) => x.parentId === null)
  }, [allItems])

  const idToItem = useMemo(() => {
    const m = new Map<string, Bookmark>()
    for (const it of currentItems) m.set(it.id, it)
    return m
  }, [currentItems])

  // 转换为 BookmarkItem 格式用于排序
  const bookmarkItems = useMemo(() => {
    return currentItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
    }))
  }, [currentItems])

  // 转换为 BookmarkItemWithUrl 格式用于点击排序
  const bookmarkItemsWithUrl = useMemo(() => {
    return currentItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      url: item.url,
    }))
  }, [currentItems])

  // 转换为 BookmarkItemWithTags 格式用于标签排序
  const bookmarkItemsWithTags = useMemo(() => {
    return currentItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      tags: item.tags,
    }))
  }, [currentItems])

  // 书签页始终显示根目录书签，folderId 固定为 null
  // activeFolderId 仅用于 FolderModal 显示，不影响主列表排序
  const order = useBookmarkOrder({
    userId: user?.id,
    folderId: null,
    itemIds: currentItems.map((x) => x.id),
    items: bookmarkItems,
    itemsWithUrl: bookmarkItemsWithUrl,
    itemsWithTags: bookmarkItemsWithTags,
    context: 'drawer',
    sortMode,
    clickCounts: clickStats.stats,
    urlToSiteId: getSiteIdFromUrl,
  })
  const visibleIds = order.visibleIds
  
  // 懒加载优化 - 只在书签数量超过阈值时启用
  const lazyLoad = useLazyVisibility(visibleIds.length)

  
  // 当文件夹或筛选变化时重置懒加载状态
  useEffect(() => {
    lazyLoad.resetVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId, selectedTag])

  // --- Actions ---
  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      // Build URL with optional tag filter
      const url = selectedTag 
        ? `/api/bookmarks?tag=${encodeURIComponent(selectedTag)}`
        : '/api/bookmarks'
      const resp = await apiFetch<{ items: Bookmark[] }>(url, {
        method: 'GET',
        token,
      })
      if (!resp.ok) return
      setAllItems(resp.data.items)
    } finally {
      setLoading(false)
    }
  }, [token, selectedTag])

  // Load all tags for autocomplete
  const loadTags = useCallback(async () => {
    if (!token) return
    try {
      const resp = await apiFetch<{ tags: string[] }>('/api/bookmarks/tags', {
        method: 'GET',
        token,
      })
      if (resp.ok) {
        setAllTags(resp.data.tags)
      }
    } catch {
      // Ignore errors - tags are optional for autocomplete
    }
  }, [token])

  // 预加载：当上划进度超过30%时开始加载数据
  const shouldPreload = swipeUpProgress > 0.3
  const hasPreloaded = useRef(false)
  
  // 当用户退出登录时清空书签数据
  useEffect(() => {
    if (!token) {
      setAllItems([])
      setAllTags([])
      setActiveFolderId(null)
      setSelectedTag(null)
      hasPreloaded.current = false
    }
  }, [token])
  
  useEffect(() => {
    if (open || (shouldPreload && !hasPreloaded.current)) {
      hasPreloaded.current = true
      void load()
      void loadTags()
      void refreshClickStats()
    }
    if (!open && !shouldPreload) {
      hasPreloaded.current = false
    }
  }, [load, loadTags, open, refreshClickStats, shouldPreload])

  useEffect(() => {
    const close = () => {
      // 如果菜单刚刚打开（< 400ms），忽略这次点击（防止触摸模拟的 click 立即关闭菜单）
      if (Date.now() - menuOpenTime.current < 400) return
      setMenu({ open: false })
    }
    if (menu.open) {
      window.addEventListener('click', close)
      window.addEventListener('scroll', close, true)
      return () => {
        window.removeEventListener('click', close)
        window.removeEventListener('scroll', close, true)
      }
    }
    return
  }, [menu.open])

  // --- API Actions ---
  const moveToFolder = async (item: Bookmark, targetFolderId: string) => {
    if (!token || !user) return
    const resp = await apiFetch(`/api/bookmarks/${item.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ parentId: targetFolderId })
    })
    if (resp.ok) {
      // 更新目标文件夹内部顺序：新项目添加到末尾
      const folderOrder = getOrder(user.id, targetFolderId, 'drawer')
      const newOrder = [...folderOrder.filter(id => id !== item.id), item.id]
      saveOrder(user.id, targetFolderId, newOrder, 'drawer')
      toast.success('已移入收藏夹')
      await load()
    }
  }

  const createFolderWithItems = async (baseItem: Bookmark, incomingItem: Bookmark, originalOrder: string[]) => {
    if (!token || !user) return
    
    // 1. 创建文件夹
    const folderResp = await apiFetch<{ item: Bookmark }>('/api/bookmarks', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: '收藏夹',
        type: 'FOLDER',
        parentId: activeFolderId
      })
    })
    if (!folderResp.ok) return toast.error(folderResp.message)
    const folder = folderResp.data.item

    // 2. 移动书签到文件夹
    await Promise.all([
      apiFetch(`/api/bookmarks/${baseItem.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ parentId: folder.id })
      }),
      apiFetch(`/api/bookmarks/${incomingItem.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ parentId: folder.id })
      }),
    ])
    
    // 3. 使用统一的工具函数更新排序（会保存到 localStorage）
    updateOrderAfterCreateFolder({
      userId: user.id,
      context: 'drawer',
      parentId: activeFolderId,
      baseItemId: baseItem.id,
      incomingItemId: incomingItem.id,
      folderId: folder.id,
      currentVisibleIds: originalOrder,
    })
    
    toast.success('已创建收藏夹')
    
    // 4. load() 会触发 useBookmarkOrder 从 localStorage 读取正确的顺序
    // 注意：savePositions() 已在 onDragEnd 中动画开始前调用
    await load()
    
    // 5. load() 完成后，手动触发补位动画
    drag.triggerFillAnimation()
  }
  
  const handleCreate = async () => {
    if (!token) return
    const name = createName.trim()
    const url = normalizeUrl(createUrl)
    // 文件夹必须有名称，书签名称可选（后端会用域名作为默认值）
    if (createType === 'FOLDER' && !name) return toast.warning('文件夹名称不能为空')
    if (createType === 'LINK' && !url) return toast.warning('网址不能为空')

    const resp = await apiFetch<{ item: Bookmark }>('/api/bookmarks', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: name || undefined,  // 允许空名称
        url: createType === 'LINK' ? url : undefined,
        note: createNote.trim() || undefined,
        type: createType,
        parentId: createParentId,
        tags: createTags.length > 0 ? createTags : undefined,
      }),
    })
    
    if (!resp.ok) return toast.error(resp.message)
    toast.success('已创建')
    setCreateOpen(false)
    resetCreateForm()
    
    const pid = createParentId ?? activeFolderId
    const currentOrder = getOrder(user!.id, pid, 'drawer')
    const base = currentOrder.length ? currentOrder : visibleIds
    const newOrder = [...base.filter((x) => x !== resp.data.item.id), resp.data.item.id]
    saveOrder(user!.id, pid, newOrder, 'drawer')
    order.setOrder(newOrder)
    
    // Refresh tags for autocomplete
    await Promise.all([load(), loadTags()])
  }
  
  const resetCreateForm = () => {
    setCreateName('')
    setCreateUrl('')
    setCreateNote('')
    setCreateTags([])
    setCreateType('LINK')
    setCreateNameSource('none')
    titleFetch.reset()
  }

  const drag = useBookmarkDrag({
    visibleIds,
    setVisibleIds: order.setOrder,
    getItemById: (id: string) => {
      const it = idToItem.get(id)
      return it ? { id: it.id, type: it.type } : null
    },
    getEl,
    onMergeIntoFolder: async (dragId: string, folderId: string) => {
      // 锁定时禁止合并到文件夹
      if (sortLocked) {
        toast.warning('排序已锁定，无法移动')
        return
      }
      const dragItem = idToItem.get(dragId)
      if (!dragItem) return
      await moveToFolder(dragItem, folderId)
    },
    onCreateFolderWith: async (baseId: string, incomingId: string, originalOrder: string[]) => {
      // 锁定时禁止创建文件夹
      if (sortLocked) {
        toast.warning('排序已锁定，无法创建文件夹')
        return
      }
      const baseItem = idToItem.get(baseId)
      const incoming = idToItem.get(incomingId)
      if (!baseItem || !incoming) return
      await createFolderWithItems(baseItem, incoming, originalOrder)
    },
    onPersistReorder: (ids: string[]) => {
      // 锁定时不持久化
      if (sortLocked) return
      
      // 非自定义模式：显示保存提示
      if (sortMode !== 'custom') {
        // 保存当前顺序和原始顺序，等待用户确认
        setPendingOrder(ids)
        setOriginalOrder(visibleIds)
        setSavePromptOpen(true)
        return
      }
      
      // 自定义模式：直接持久化
      order.persist(ids)
      order.setOrder(ids)
    },
    options: {
      prePush: dndPrePush,
      pushAnimation: dndPushAnim,
      dropAnimation: dndDropAnim,
    },
    // 锁定时禁用拖拽
    disabled: sortLocked,
  })


  // --- Render Helpers ---
  const renderItem = (b: Bookmark) => {
    return (
      <DrawerBookmarkItem
        key={b.id}
        item={b}
        allItems={allItems}
        userId={user?.id}
        drag={{
          activeId: drag.activeId,
          combineCandidateId: drag.combineCandidateId,
          combineTargetId: drag.combineTargetId,
          onPointerDown: drag.onPointerDown,
          onDragCancel: drag.onDragCancel,
        }}
        customIconOk={customIconOk}
        setCustomIconOk={setCustomIconOk}
        setElRef={setElRef}
        onFolderClick={(folderId, rect) => {
          setFolderOriginRect(rect || null)
          setActiveFolderId(folderId)
          setFolderModalOpen(true)
        }}
        onBookmarkClick={(item) => {
          if (item.url) {
            trackClick(item.id)
            window.open(item.url, '_blank', 'noopener,noreferrer')
          }
        }}
        onContextMenu={(item, x, y) => {
          setMenu({ open: true, x, y, item })
        }}
        onLongPress={() => {
          menuOpenTime.current = Date.now()
        }}
        onTagClick={setSelectedTag}
      />
    )
  }

  // 如果是下滑关闭且 open 已经为 false，直接返回 null
  // closedViaSwipe 在 effect 中会被重置
  if (!open && closedViaSwipe.current) {
    return null
  }

  // 上划预览效果：显示书签页淡入
  // 关键：swipeUpProgress 在上划触发后不会立即重置，所以预览会保持到真实页面可见
  // 当 open 且 isVisible 时隐藏预览，实现无缝过渡
  // 如果刚刚关闭，不显示预览，防止闪屏
  const showSwipePreview = swipeUpProgress > 0 && !(open && isVisible) && !justClosed.current

  if (!shouldRender && !showSwipePreview && !isSwipeAnimating) return null

  // 上划预览模式 - 书签页从底部滑出 + 淡入，背景模糊
  // 显示真实内容，让用户可以一直上划直接进入
  if (showSwipePreview || isSwipeAnimating) {
    // 书签页从底部滑出：translateY 从 70% 到 0（从屏幕底部滑入）
    const slideUp = 70 * (1 - swipeUpProgress)
    // 背景模糊程度随进度增加（0 到 24px）
    const blurAmount = swipeUpProgress * 24
    // 背景透明度随进度增加（0 到 0.3）
    const bgOpacity = swipeUpProgress * 0.3
    // 是否需要过渡动画（返回时）
    const needTransition = isSwipeAnimating
    
    // 获取要显示的书签（最多显示12个预览）
    const previewItems = visibleIds.slice(0, 12).map(id => idToItem.get(id)).filter(Boolean) as Bookmark[]
    const hasData = previewItems.length > 0
    
    return createPortal(
      <div className="fixed inset-0 z-[100] flex flex-col pointer-events-none overflow-hidden">
        {/* 背景遮罩 - 透明度和模糊度随上划进度渐变，返回时带过渡动画 */}
        <div 
          className="absolute inset-0"
          style={{ 
            backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`,
            backdropFilter: `blur(${blurAmount}px)`,
            WebkitBackdropFilter: `blur(${blurAmount}px)`,
            transition: needTransition ? 'all 300ms ease-out' : 'none',
          }}
        />
        
        {/* 书签页内容 - 从底部滑出 + 淡入，返回时带过渡动画 */}
        <div 
          className="relative flex flex-col h-full w-full max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6"
          style={{ 
            transform: `translateY(${slideUp}%)`,
            opacity: swipeUpProgress,
            transition: needTransition ? 'all 300ms ease-out' : 'none',
          }}
        >
          {/* 顶部 - 搜索栏居中 */}
          <div className="flex justify-center mb-6">
            <SearchBox disableGlobalFocus />
          </div>
          
          {/* 真实书签网格预览 - 只有有书签时才显示 */}
          {hasData && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 min-h-full">
                {/* 使用与真实页面相同的网格布局: grid-cols-4 gap-3，alignItems: start */}
                <div 
                  className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3"
                  style={{ alignItems: 'start' }}
                >
                  {previewItems.map((b) => {
                    const isFolder = b.type === 'FOLDER'
                    
                    // 图标逻辑：优先自定义图标
                    let customIcon = ''
                    if (b.iconType === 'URL' && b.iconUrl) {
                      customIcon = b.iconUrl
                    } else if (b.iconType === 'BASE64' && b.iconData) {
                      customIcon = b.iconData
                    }
                    const hasCustomIcon = Boolean(customIcon)
                    
                    return (
                      <div key={b.id} className="select-none relative group w-16">
                        <div className="grid place-items-center">
                          <div className={cn(
                            'relative w-12 h-12 rounded-[var(--start-radius)] flex items-center justify-center overflow-hidden',
                            isFolder
                              ? 'bg-glass/20 border border-glass-border/20'
                              : hasCustomIcon
                                ? 'bg-white/70'
                                : 'bg-primary/15 text-primary font-semibold'
                          )}>
                            {isFolder ? (
                              <Folder className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            ) : hasCustomIcon ? (
                              <img src={customIcon} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                              <Favicon url={b.url || ''} name={b.name} className="h-full w-full object-cover" letterClassName="h-full w-full" />
                            )}
                          </div>
                          <div className="mt-1.5 text-[11px] text-fg/80 truncate w-16 text-center">{b.name}</div>
                          {/* 标签占位 - 与真实页面保持相同高度 */}
                          <div className="w-16 min-h-[14px] mt-0.5" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* 背景遮罩 - 带动画，下滑时逐渐透明和减少模糊 */}
      {/* 移除 onClick，改为只能通过下滑或返回键关闭 */}
      <div 
        className={cn(
          "absolute inset-0 pointer-events-none transition-all duration-300 ease-out",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          backgroundColor: `rgba(0, 0, 0, ${0.3 * (1 - swipeDownProgress)})`,
          backdropFilter: `blur(${24 * (1 - swipeDownProgress)}px)`,
          WebkitBackdropFilter: `blur(${24 * (1 - swipeDownProgress)}px)`,
          // 下滑时禁用过渡，让手势跟手
          transition: swipeDownProgress > 0 && !isSwipeDownAnimating ? 'none' : undefined,
        }}
      />
      
      {/* 内容区域 - 带动画，下滑时向下移动并淡出 */}
      <div 
        className={cn(
          "relative flex flex-col h-full w-full max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6",
          "transition-all duration-300 ease-out",
          // touch-action: none 阻止浏览器默认的下拉刷新
          "touch-none",
          isVisible 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 translate-y-4"
        )}
        style={{ 
          transform: swipeDownProgress > 0 ? `translateY(${swipeDownProgress * 15}%)` : undefined,
          opacity: swipeDownProgress > 0 ? 1 - swipeDownProgress : undefined,
          // 下滑时禁用过渡，让手势跟手
          transition: swipeDownProgress > 0 && !isSwipeDownAnimating ? 'none' : undefined,
        }}
        ref={contentRef}
        onTouchEnd={handleSwipeEnd}
        onTouchCancel={handleSwipeEnd}
      >
        {/* 顶部栏 - 固定不滚动，毛玻璃样式 */}
        <div className="flex-shrink-0 pb-4 bg-transparent">
          {/* 搜索栏和排序控件 */}
          <div className="flex items-center gap-3">
            {/* 桌面端关闭按钮 */}
            {!isMobile && (
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-glass/20 hover:bg-glass/40 transition-colors"
                title="关闭书签页 (Esc)"
              >
                <X className="w-5 h-5 text-fg/70" />
              </button>
            )}
            
            {/* 搜索框 */}
            <div className="flex-1">
              <SearchBox disableGlobalFocus />
            </div>
            
            {/* 排序选择器 */}
            <SortModeSelector
              value={sortMode}
              onChange={setSortMode}
              locked={sortLocked}
            />
          </div>
        </div>

        {/* 书签网格 - 可滚动，无边框，支持懒加载 */}
        {/* overscroll-contain 阻止浏览器下拉刷新，同时保留滚动功能 */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain" 
          ref={(el) => {
            lazyLoad.setScrollContainer(el)
            scrollContainerRef.current = el
          }}
        >
          <div className="p-4 min-h-full">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3 sm:gap-3" style={{ alignItems: 'start' }}>
              {visibleIds.map((id) => {
                const it = idToItem.get(id)
                if (!it) return null
                
                // 懒加载：未进入视窗的显示骨架屏
                if (lazyLoad.enabled && !lazyLoad.isVisible(id)) {
                  return (
                    <div
                      key={id}
                      ref={(el) => lazyLoad.registerRef(id, el)}
                      data-lazy-id={id}
                      className="w-16"
                    >
                      <div className="grid place-items-center">
                        <div className="h-12 w-12 rounded-[var(--start-radius)] bg-glass/20 animate-pulse" />
                        <div className="mt-1.5 h-3 w-10 rounded bg-glass/15 animate-pulse" />
                        <div className="w-16 min-h-[14px] mt-0.5" />
                      </div>
                    </div>
                  )
                }
                
                // 已加载项：包裹 ref 用于懒加载追踪
                return (
                  <div
                    key={id}
                    ref={lazyLoad.enabled ? (el) => lazyLoad.registerRef(id, el) : undefined}
                    data-lazy-id={id}
                  >
                    {renderItem(it)}
                  </div>
                )
              })}

              {/* 添加按钮 */}
              <button
                type="button"
                className={cn('select-none cursor-pointer outline-none focus:outline-none focus:ring-0 w-16')}
                onClick={() => {
                  if (!user) {
                    setLoginPromptOpen(true)
                    return
                  }
                  setCreateParentId(activeFolderId)
                  setCreateType('LINK')
                  setCreateOpen(true)
                }}
              >
                <div className="grid place-items-center">
                  <div className="h-12 w-12 rounded-[var(--start-radius)] grid place-items-center bg-white/60 text-fg/80 hover:bg-white/80 transition-colors duration-200">
                    <span className="text-2xl leading-none">+</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-fg/70 truncate w-16 text-center">添加</div>
                  {/* Placeholder for tags area to match bookmark height */}
                  <div className="w-16 min-h-[14px] mt-0.5" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 拖拽覆盖层 */}
      {drag.activeId && createPortal(
        <div ref={drag.overlayRef} style={drag.overlayStyle}>
          {(() => {
            const it = allItems.find((x) => x.id === drag.activeId)
            if (!it) return null
            const isFolder = it.type === 'FOLDER'
            const folderItems = isFolder
              ? getSortedFolderChildren(allItems.filter((x) => x.parentId === it.id), user?.id, it.id, 'drawer').slice(0, 9)
              : []
            return (
              <div className="bm-inner">
                <div className="grid place-items-center select-none">
                  <div
                    ref={drag.overlayBoxRef}
                    className={cn(
                      'bookmark-icon h-12 w-12 rounded-[var(--start-radius)] overflow-hidden grid place-items-center shadow-2xl select-none',
                      isFolder
                        ? 'bg-glass/20 border border-glass-border/20 p-1'
                        : 'bg-primary/15 text-primary font-semibold',
                    )}
                  >
                  {isFolder ? (
                    <div className="grid grid-cols-3 gap-0.5 w-full h-full content-start">
                      {folderItems.map((sub) => (
                        <div
                          key={sub.id}
                          className="w-full pt-[100%] relative bg-black/10 rounded-[2px] overflow-hidden"
                        >
                          {sub.url ? (
                            <Favicon
                              url={sub.url}
                              name={sub.name}
                              size={16}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Favicon
                      url={it.url || ''}
                      name={it.name}
                      className="h-full w-full object-cover"
                      letterClassName="h-full w-full"
                    />
                  )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-fg/80 truncate w-16 text-center">
                    {it.name}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>,
        document.body
      )}


      {/* 右键菜单 */}
      <DrawerContextMenu
        menu={menu}
        menuClosing={menuClosing}
        menuOpenTime={menuOpenTime}
        availableFolders={availableFolders}
        isShortcut={isShortcut}
        isShortcutFull={isFull}
        onClose={closeMenu}
        onOpenFolder={(folderId) => {
          setActiveFolderId(folderId)
          setFolderModalOpen(true)
        }}
        onAddToFolder={(folderId) => { setCreateParentId(folderId); setCreateType('LINK'); setCreateOpen(true); }}
        onEdit={(item) => { 
          setEditItem(item); 
          setEditName(item.name); 
          if (item.type === 'LINK') {
            setEditUrl(item.url!); 
            setEditNote(item.note || ''); 
            setEditTags(item.tags || []);
            setEditIconUrl(item.iconUrl || '');
            setEditIconPreviewError(false);
          }
          setEditOpen(true); 
        }}
        onDelete={(item, mode) => { setDeleteItem(item); setDeleteMode(mode); setDeleteOpen(true); }}
        onAddShortcut={addShortcut}
        onRemoveShortcut={removeShortcut}
        onMoveToFolder={moveToFolder}
      />

      {/* 删除确认对话框 */}
      <DrawerDeleteDialog
        open={deleteOpen}
        isClosing={deleteClosing}
        item={deleteItem}
        mode={deleteMode}
        token={token}
        userId={user?.id}
        activeFolderId={activeFolderId}
        allItems={allItems}
        visibleIds={visibleIds}
        onClose={() => { setDeleteClosing(true); setTimeout(() => { setDeleteOpen(false); setDeleteClosing(false); }, 150); }}
        onDeleted={() => {}}
        setActiveFolderId={setActiveFolderId}
        setOrder={order.setOrder}
        removeShortcut={removeShortcut}
        load={load}
      />

      {/* 创建对话框 */}
      <DrawerCreateDialog
        open={createOpen}
        isClosing={createClosing}
        parentId={createParentId}
        createType={createType}
        setCreateType={setCreateType}
        createUrl={createUrl}
        setCreateUrl={setCreateUrl}
        createName={createName}
        setCreateName={setCreateName}
        createNameSource={createNameSource}
        setCreateNameSource={setCreateNameSource}
        createNote={createNote}
        setCreateNote={setCreateNote}
        createTags={createTags}
        setCreateTags={setCreateTags}
        titleFetch={titleFetch}
        allTags={allTags}
        onCloseWithReset={() => { setCreateClosing(true); setTimeout(() => { setCreateOpen(false); setCreateClosing(false); resetCreateForm(); }, 150); }}
        onCreate={handleCreate}
      />

      {/* 保存排序提示对话框 */}
      <DrawerSavePromptDialog
        open={savePromptOpen}
        pendingOrder={pendingOrder}
        onClose={() => {
          setSavePromptOpen(false)
          setPendingOrder(null)
          setOriginalOrder(null)
        }}
        onRestore={() => {
          if (originalOrder) {
            order.setOrder(originalOrder)
          }
        }}
        onSave={() => {
          if (pendingOrder) {
            order.persist(pendingOrder)
            order.setOrder(pendingOrder)
            setSortMode('custom')
          }
        }}
      />

      {/* 编辑对话框 */}
      <DrawerEditDialog
        open={editOpen}
        isClosing={editClosing}
        item={editItem}
        token={token}
        editName={editName}
        setEditName={setEditName}
        editUrl={editUrl}
        setEditUrl={setEditUrl}
        editNote={editNote}
        setEditNote={setEditNote}
        editTags={editTags}
        setEditTags={setEditTags}
        editIconUrl={editIconUrl}
        setEditIconUrl={setEditIconUrl}
        editIconPreviewError={editIconPreviewError}
        setEditIconPreviewError={setEditIconPreviewError}
        allTags={allTags}
        onClose={() => { setEditClosing(true); setTimeout(() => { setEditOpen(false); setEditClosing(false); }, 150); }}
        onSaved={(itemId) => {
          setCustomIconOk(prev => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
        }}
        load={load}
        loadTags={loadTags}
      />

      {/* 登录提示模态框 */}
      <DrawerLoginPrompt
        open={loginPromptOpen}
        onClose={() => setLoginPromptOpen(false)}
        onLogin={() => { onClose(); navigate('/login'); }}
      />

      {/* 文件夹模态框 */}
      <FolderModal
        open={folderModalOpen}
        folder={allItems.find(x => x.id === activeFolderId) ?? null}
        folderItems={(() => {
          // 获取文件夹内的子项并按保存的顺序排列
          const children = allItems.filter(x => x.parentId === activeFolderId)
          if (!user?.id || !activeFolderId) return children
          const folderOrder = getOrder(user.id, activeFolderId, 'drawer')
          if (!folderOrder.length) return children
          const orderMap = new Map(folderOrder.map((id, i) => [id, i]))
          return [...children].sort((a, b) => {
            const ia = orderMap.get(a.id) ?? Infinity
            const ib = orderMap.get(b.id) ?? Infinity
            return ia - ib
          })
        })()}
        allItems={allItems}
        userId={user?.id}
        context="drawer"
        originRect={folderOriginRect}
        getElRef={getEl}
        onClose={() => {
          setFolderModalOpen(false)
          setActiveFolderId(null)
          setFolderOriginRect(null)
        }}
        onItemClick={(item) => {
          if (item.url) {
            trackClick(item.id)
            window.open(item.url, '_blank', 'noopener,noreferrer')
          }
        }}
        onSubFolderClick={(folder, rect) => {
          setFolderOriginRect(rect)
          setActiveFolderId(folder.id)
        }}
      />
    </div>,
    document.body
  )
}
