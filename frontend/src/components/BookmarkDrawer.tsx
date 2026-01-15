import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { cn } from '../utils/cn'
import { normalizeUrl } from '../utils/url'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { ArrowLeft, Folder, Loader2, Lock, X } from 'lucide-react'
import { useBookmarkOrder } from './bookmarks/useBookmarkOrder'
import { useBookmarkDrag } from './bookmarks/useBookmarkDrag'
import { getOrder, saveOrder, storageKey } from './bookmarks/orderStorage'
import { useBookmarkDndStore } from '../stores/bookmarkDnd'
import { useAppearanceStore } from '../stores/appearance'
import { SearchBox } from './SearchBox'
import { SortModeSelector } from './SortModeSelector'
import { useShortcutSet } from './bookmarks/useShortcutSet'
import { useTitleFetch } from '../hooks/useTitleFetch'
import { useClickTracker, getSiteIdFromUrl } from '../hooks/useClickTracker'

// --- Types ---

type BookmarkType = 'LINK' | 'FOLDER'

type Bookmark = {
  id: string
  name: string
  url: string | null
  note: string | null
  type: BookmarkType
  parentId: string | null
  createdAt: string
  updatedAt: string
}

type MenuState =
  | { open: false }
  | { open: true; x: number; y: number; item: Bookmark }

// --- Props ---

type BookmarkDrawerProps = {
  open: boolean
  onClose: () => void
}

// --- Helpers ---

function DraggableBookmarkItem(props: {
  item: Bookmark
  activeDragId: string | null
  setElRef: (id: string, el: HTMLDivElement | null) => void
  onPointerDown: (id: string, ev: React.PointerEvent<HTMLDivElement>) => void
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  title?: string
  children: React.ReactNode
}) {
  const { item, activeDragId, setElRef, onPointerDown, onClick, onContextMenu, title, children } = props

  const mergedRef = (el: HTMLDivElement | null) => {
    setElRef(item.id, el)
  }

  const isBeingDragged = activeDragId === item.id

  return (
    <div
      ref={mergedRef}
      className={cn(
        'select-none relative group touch-none',
        isBeingDragged ? 'opacity-0 pointer-events-none' : 'opacity-100',
      )}
      style={{
        // 始终使用相同的 transition，避免属性切换导致的重排
        transition: 'opacity 150ms',
      }}
      onPointerDown={(e) => {
        onPointerDown(item.id, e)
      }}
      onClick={(e) => {
        if (activeDragId) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        onClick(e)
      }}
      onContextMenu={onContextMenu}
      title={title}
    >
      <div className="bm-inner">{children}</div>
    </div>
  )
}

export function BookmarkDrawer({ open, onClose }: BookmarkDrawerProps) {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  
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
  const [loading, setLoading] = useState(false)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  
  // Animation state - 用于控制进入/退出动画
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  
  // 处理进入/退出动画
  useEffect(() => {
    if (open) {
      setShouldRender(true)
      // 使用 requestAnimationFrame 确保 DOM 已渲染后再触发动画
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
    } else {
      setIsVisible(false)
      // 等待退出动画完成后再卸载组件
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 200) // 退出动画更快
      return () => clearTimeout(timer)
    }
  }, [open])

  // UI States
  const [menu, setMenu] = useState<MenuState>({ open: false })
  const menuRef = useRef<HTMLDivElement | null>(null)

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
  const [editItem, setEditItem] = useState<Bookmark | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editNote, setEditNote] = useState('')

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<Bookmark | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [createType, setCreateType] = useState<BookmarkType>('LINK')
  const [createName, setCreateName] = useState('')
  const [createUrl, setCreateUrl] = useState('')
  const [createNote, setCreateNote] = useState('')
  const [createNameSource, setCreateNameSource] = useState<'user' | 'auto' | 'none'>('none')

  // 登录提示模态框
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)

  const [faviconOk, setFaviconOk] = useState<Record<string, boolean>>({})

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

  const currentItems = useMemo(() => {
    return allItems.filter((x) => x.parentId === activeFolderId)
  }, [allItems, activeFolderId])

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

  const order = useBookmarkOrder({
    userId: user?.id,
    folderId: activeFolderId,
    itemIds: currentItems.map((x) => x.id),
    items: bookmarkItems,
    itemsWithUrl: bookmarkItemsWithUrl,
    context: 'drawer',
    sortMode,
    clickCounts: clickStats.stats,
    urlToSiteId: getSiteIdFromUrl,
  })
  const visibleIds = order.visibleIds

  const activeFolder = useMemo(() => {
    return allItems.find((x) => x.id === activeFolderId)
  }, [allItems, activeFolderId])

  // --- Actions ---
  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await apiFetch<{ items: Bookmark[] }>('/api/bookmarks', {
        method: 'GET',
        token,
      })
      if (!resp.ok) return
      setAllItems(resp.data.items)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (open) {
      void load()
      void refreshClickStats()
    }
  }, [load, open, refreshClickStats])

  useEffect(() => {
    const close = () => setMenu({ open: false })
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
    if (!token) return
    const resp = await apiFetch(`/api/bookmarks/${item.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ parentId: targetFolderId })
    })
    if (resp.ok) {
      toast.success('已移入收藏夹')
      await load()
    }
  }

  const createFolderWithItems = async (baseItem: Bookmark, incomingItem: Bookmark) => {
    if (!token) return
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

    const currentOrder = getOrder(user!.id, activeFolderId)
    const baseOrder = currentOrder.length ? currentOrder : visibleIds
    const baseIdx = baseOrder.indexOf(baseItem.id)
    
    if (baseIdx !== -1) {
      baseOrder.splice(baseIdx, 1, folder.id)
    } else {
      baseOrder.push(folder.id)
    }
    const newOrder = baseOrder.filter(id => id !== incomingItem.id)
    
    saveOrder(user!.id, activeFolderId, newOrder)
    order.setOrder(newOrder)
    
    toast.success('已创建收藏夹')
    await load()
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
        parentId: createParentId
      }),
    })
    
    if (!resp.ok) return toast.error(resp.message)
    toast.success('已创建')
    setCreateOpen(false)
    resetCreateForm()
    
    const pid = createParentId ?? activeFolderId
    const currentOrder = getOrder(user!.id, pid)
    const base = currentOrder.length ? currentOrder : visibleIds
    const newOrder = [...base.filter((x) => x !== resp.data.item.id), resp.data.item.id]
    saveOrder(user!.id, pid, newOrder)
    order.setOrder(newOrder)
    
    await load()
  }
  
  const resetCreateForm = () => {
    setCreateName('')
    setCreateUrl('')
    setCreateNote('')
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
    onCreateFolderWith: async (baseId: string, incomingId: string) => {
      // 锁定时禁止创建文件夹
      if (sortLocked) {
        toast.warning('排序已锁定，无法创建文件夹')
        return
      }
      const baseItem = idToItem.get(baseId)
      const incoming = idToItem.get(incomingId)
      if (!baseItem || !incoming) return
      await createFolderWithItems(baseItem, incoming)
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
  } as any)


  // --- Render Helpers ---
  const renderItem = (b: Bookmark) => {
    const isFolder = b.type === 'FOLDER'
    const isCombineCandidate = drag.combineCandidateId === b.id
    const isCombineTarget = drag.combineTargetId === b.id
    
    const folderItems = isFolder ? allItems.filter(x => x.parentId === b.id).slice(0, 9) : []
    
    const letter = (b.name?.trim()?.[0] ?? '?').toUpperCase()
    let favicon = ''
    if (!isFolder && b.url) {
      try {
        const host = new URL(b.url).hostname
        favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
      } catch {
        /* ignore */
      }
    }
    const showFavicon = Boolean(favicon && faviconOk[b.id] !== false)

    const showCombine = isCombineCandidate || isCombineTarget
    const iconRing = isCombineTarget
      ? 'ring-2 ring-primary ring-offset-2'
      : isCombineCandidate
        ? 'ring-2 ring-primary/60 ring-offset-2'
        : ''

    return (
      <DraggableBookmarkItem
        key={b.id}
        item={b}
        activeDragId={drag.activeId}
        setElRef={setElRef}
        onPointerDown={(id, ev) => {
          if (ev.button !== 0) return
          drag.onPointerDown(id, ev.nativeEvent, ev.currentTarget)
        }}
        onClick={(e) => {
          if (drag.activeId) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          if (isFolder) setActiveFolderId(b.id)
          else if (b.url) {
            // 记录点击（异步，不阻塞）
            trackClick(b.id)
            window.open(b.url, '_blank', 'noopener,noreferrer')
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          const x = e.clientX + 8
          const y = e.clientY + 8
          setMenu({ open: true, x, y, item: b })
        }}
        title={b.note ? `备注：${b.note}` : ''}
      >
        <div className="grid place-items-center">
          <div
            className={cn(
              'bookmark-icon h-12 w-12 rounded-[var(--start-radius)] overflow-hidden grid place-items-center relative',
              isFolder
                ? 'bg-glass/20 border border-glass-border/20 p-[2px]'
                : showFavicon
                  ? 'bg-white/70'
                  : 'bg-primary/15 text-primary font-semibold',
              iconRing,
              showCombine && 'scale-[1.03]',
            )}
            style={{
              // 始终使用相同的 transition，只对需要动画的属性
              transition: 'transform 200ms, box-shadow 200ms',
            }}
          >
            {showCombine && !isFolder ? (
              <div className="absolute inset-0 rounded-[var(--start-radius)] bg-glass/25 border border-primary/60 grid place-items-center">
                <Folder className="w-5 h-5 text-primary" />
              </div>
            ) : null}

            <div className={cn('absolute inset-0', showCombine && !isFolder ? 'opacity-15' : 'opacity-100')}>
              {isFolder ? (
                <div className="grid grid-cols-3 gap-0.5 w-full h-full content-start">
                  {folderItems.map((sub) => {
                    let subFav = ''
                    if (sub.url) {
                      try {
                        subFav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(sub.url).hostname)}&sz=16`
                      } catch {
                        /* ignore */
                      }
                    }
                    return (
                      <div
                        key={sub.id}
                        className="w-full pt-[100%] relative bg-black/10 rounded-[2px] overflow-hidden"
                      >
                        {subFav ? (
                          <img
                            src={subFav}
                            className="absolute inset-0 w-full h-full object-cover"
                            alt=""
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <>
                  {showFavicon ? (
                    <img
                      src={favicon}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(ev) => {
                        ;(ev.currentTarget as HTMLImageElement).style.display = 'none'
                        setFaviconOk((prev) => ({ ...prev, [b.id]: false }))
                      }}
                    />
                  ) : null}
                  <span className={cn(showFavicon ? 'hidden' : '')}>{letter}</span>
                </>
              )}
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-fg/80 truncate w-16 text-center">{b.name}</div>
        </div>
      </DraggableBookmarkItem>
    )
  }

  if (!shouldRender) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* 背景遮罩 - 带动画 */}
      <div 
        className={cn(
          "absolute inset-0 bg-black/30 backdrop-blur-xl transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionTimingFunction: isVisible ? 'cubic-bezier(0.4, 0, 0.2, 1)' : 'cubic-bezier(0.4, 0, 1, 1)' }}
        onClick={onClose}
      />
      
      {/* 内容区域 - 带动画 */}
      <div 
        className={cn(
          "relative flex flex-col h-full w-full max-w-4xl mx-auto px-4 py-6 transition-all",
          isVisible 
            ? "opacity-100 translate-y-0 duration-300" 
            : "opacity-0 translate-y-4 duration-200"
        )}
        style={{ transitionTimingFunction: isVisible ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)' }}
      >
        {/* 顶部：关闭按钮和搜索栏 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-glass/20 hover:bg-glass/40 transition-colors"
          >
            <X className="w-5 h-5 text-fg/70" />
          </button>
          <div className="flex-1 mx-4">
            <SearchBox className="w-full max-w-xl mx-auto" />
          </div>
          <div className="w-9" /> {/* 占位，保持对称 */}
        </div>

        {/* 文件夹导航和排序 */}
        <div className="flex items-center gap-2 mb-4">
          {activeFolderId && (
            <Button variant="ghost" size="sm" onClick={() => setActiveFolderId(null)} className="h-8 px-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> 返回
            </Button>
          )}
          <div className="text-sm text-fg/70">
            {activeFolder ? `📂 ${activeFolder.name}` : '全部书签'}
          </div>
          <div className="flex-1" />
          <SortModeSelector
            value={sortMode}
            onChange={setSortMode}
            locked={sortLocked}
          />
          {sortLocked && (
            <div className="flex items-center gap-1 text-xs text-fg/50">
              <Lock className="w-3 h-3" />
              <span>已锁定</span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>刷新</Button>
        </div>

        {/* 书签网格 - 可滚动，无边框 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 min-h-full">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {visibleIds.map((id) => idToItem.get(id)).filter(Boolean).map((it) => renderItem(it!))}

              {/* 添加按钮 */}
              <button
                type="button"
                className={cn('select-none cursor-pointer outline-none focus:outline-none focus:ring-0')}
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
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 拖拽覆盖层 */}
      {drag.activeId && (
        <div ref={drag.overlayRef} style={drag.overlayStyle}>
          {(() => {
            const it = allItems.find((x) => x.id === drag.activeId)
            if (!it) return null
            const isFolder = it.type === 'FOLDER'
            const letter = (it.name?.trim()?.[0] ?? '?').toUpperCase()
            let favicon = ''
            if (!isFolder && it.url) {
              try {
                const host = new URL(it.url).hostname
                favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
              } catch {
                /* ignore */
              }
            }
            const folderItems = isFolder
              ? allItems.filter((x) => x.parentId === it.id).slice(0, 9)
              : []
            const showFavicon = Boolean(favicon)
            return (
              <div className="bm-inner grid place-items-center select-none">
                <div
                  ref={drag.overlayBoxRef}
                  className={cn(
                    'bookmark-icon h-12 w-12 rounded-[var(--start-radius)] overflow-hidden grid place-items-center shadow-2xl select-none',
                    isFolder
                      ? 'bg-glass/20 border border-glass-border/20 p-1'
                      : showFavicon
                        ? 'bg-white/70'
                        : 'bg-primary/15 text-primary font-semibold',
                  )}
                >
                  {isFolder ? (
                    <div className="grid grid-cols-3 gap-0.5 w-full h-full content-start">
                      {folderItems.map((sub) => {
                        let subFav = ''
                        if (sub.url) {
                          try {
                            subFav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(sub.url).hostname)}&sz=16`
                          } catch {
                            /* ignore */
                          }
                        }
                        return (
                          <div
                            key={sub.id}
                            className="w-full pt-[100%] relative bg-black/10 rounded-[2px] overflow-hidden"
                          >
                            {subFav ? (
                              <img
                                src={subFav}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt=""
                              />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <>
                      {showFavicon ? (
                        <img src={favicon} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      <span className={cn(showFavicon ? 'hidden' : '')}>{letter}</span>
                    </>
                  )}
                </div>
                <div className="mt-1.5 text-[11px] text-fg/80 truncate w-16 text-center">
                  {it.name}
                </div>
              </div>
            )
          })()}
        </div>
      )}


      {/* 右键菜单 */}
      {menu.open && (
        <div className="fixed inset-0 z-[110]" onClick={(e) => { e.stopPropagation(); setMenu({open:false}) }} onContextMenu={(e)=>{e.preventDefault();setMenu({open:false})}}>
          <div 
            ref={menuRef}
            className="fixed z-[111] glass-panel-strong rounded-[var(--start-radius)] p-2 w-48 border border-glass-border/25 shadow-xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 300) }}
          >
            <div className="px-2 py-2 text-xs text-fg/70 truncate border-b border-glass-border/10 mb-1">{menu.item.name}</div>
            {menu.item.type === 'FOLDER' ? (
              <>
                <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); setActiveFolderId(menu.item.id) }}>打开</Button>
                <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); setCreateParentId(menu.item.id); setCreateType('LINK'); setCreateOpen(true); }}>添加书签</Button>
                <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); setEditItem(menu.item); setEditName(menu.item.name); setEditOpen(true); }}>重命名</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); setEditItem(menu.item); setEditName(menu.item.name); setEditUrl(menu.item.url!); setEditNote(menu.item.note||''); setEditOpen(true); }}>编辑</Button>
                <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); window.open(menu.item.url!, '_blank'); }}>打开</Button>
                {/* 快捷方式操作 */}
                {isShortcut(menu.item.id) ? (
                  <Button variant="ghost" className="w-full justify-start h-8 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50/10" onClick={() => { setMenu({open:false}); removeShortcut(menu.item.id); toast.success('已从快捷栏移除'); }}>从快捷栏移除</Button>
                ) : (
                  <Button 
                    variant="ghost" 
                    className={cn(
                      "w-full justify-start h-8 text-sm",
                      isFull() ? "text-fg/40 cursor-not-allowed" : "text-primary hover:text-primary/80"
                    )}
                    disabled={isFull()}
                    onClick={() => { 
                      if (isFull()) {
                        toast.warning('快捷栏已满，请先移除一些快捷方式')
                        return
                      }
                      setMenu({open:false}); 
                      addShortcut(menu.item.id); 
                      toast.success('已添加至快捷栏'); 
                    }}
                  >
                    {isFull() ? '快捷栏已满' : '添加至快捷栏'}
                  </Button>
                )}
                {availableFolders.length > 0 && (
                  <div className="border-t border-glass-border/10 mt-1 pt-1">
                    <div className="px-2 py-1 text-[10px] text-fg/50">移动到...</div>
                    {availableFolders.map(folder => (
                      <Button 
                        key={folder.id} 
                        variant="ghost" 
                        className="w-full justify-start h-8 text-sm truncate" 
                        onClick={async () => { 
                          setMenu({open:false});
                          await moveToFolder(menu.item, folder.id);
                        }}
                      >
                        📂 {folder.name}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
            <Button variant="ghost" className="w-full justify-start h-8 text-sm text-red-500 hover:text-red-600 hover:bg-red-50/10" onClick={() => { setMenu({open:false}); setDeleteItem(menu.item); setDeleteOpen(true); }}>删除</Button>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteOpen && deleteItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">确认删除</h3>
            <p className="text-sm text-fg/70 mt-2">
              确定要删除 {deleteItem.type === 'FOLDER' ? '收藏夹' : '书签'} "{deleteItem.name}" 吗？
              {deleteItem.type === 'FOLDER' && <br/>}
              {deleteItem.type === 'FOLDER' && <span className="text-xs text-fg/50 block mt-1">文件夹内的书签将移动到上一级。</span>}
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>取消</Button>
              <Button variant="primary" className="bg-red-600 border-red-600 hover:bg-red-700 text-white" onClick={async () => {
                setDeleteOpen(false);
                if(!token || !deleteItem) return;

                const isFolder = deleteItem.type === 'FOLDER'
                const folderId = deleteItem.id
                const parentId = deleteItem.parentId ?? null
                const userId = user?.id

                let nextParentOrder: string[] | null = null
                if (isFolder && userId) {
                  const childIdsRaw = allItems.filter((x) => x.parentId === folderId).map((x) => x.id)
                  const folderOrder = getOrder(userId, folderId)
                  const set = new Set(childIdsRaw)
                  const orderedChildren = [
                    ...folderOrder.filter((id) => set.has(id)),
                    ...childIdsRaw.filter((id) => !folderOrder.includes(id)),
                  ]

                  const persistedParent = getOrder(userId, parentId)
                  const fallbackParent = allItems.filter((x) => x.parentId === parentId).map((x) => x.id)
                  const baseOrder = persistedParent.length ? persistedParent : fallbackParent

                  const rawIdx = baseOrder.indexOf(folderId)
                  const insertIdx = rawIdx >= 0 ? rawIdx : baseOrder.length
                  const base = baseOrder.filter((id) => id !== folderId && !set.has(id))
                  const idx = Math.max(0, Math.min(insertIdx, base.length))
                  nextParentOrder = [
                    ...base.slice(0, idx),
                    ...orderedChildren,
                    ...base.slice(idx),
                  ]
                }

                const resp = await apiFetch(`/api/bookmarks/${deleteItem.id}`, { method: 'DELETE', token });
                if(resp.ok) {
                  toast.success('已删除');
                  // 删除书签时自动从快捷方式集合移除
                  removeShortcut(deleteItem.id);
                  if (deleteItem.id === activeFolderId) setActiveFolderId(deleteItem.parentId ?? null);
                  if (nextParentOrder && user?.id) {
                    saveOrder(user.id, deleteItem.parentId ?? null, nextParentOrder)
                    if ((deleteItem.parentId ?? null) === activeFolderId) {
                      order.setOrder(nextParentOrder)
                    }
                    try {
                      localStorage.removeItem(storageKey(user.id, deleteItem.id))
                    } catch {
                      // ignore
                    }
                  }
                  await load();
                } else {
                  toast.error(resp.message);
                }
              }}>删除</Button>
            </div>
          </div>
        </div>
      )}

      {/* 创建对话框 */}
      {createOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setCreateOpen(false); resetCreateForm(); }} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">{createParentId ? '添加到文件夹' : '新增书签/文件夹'}</h3>
            
            <div className="flex gap-2 bg-glass/5 p-1 rounded-xl">
              <button className={cn("flex-1 py-1.5 text-xs font-medium rounded-lg transition-all", createType==='LINK' ? "bg-white/20 shadow-sm text-fg" : "text-fg/50")} onClick={()=>{ setCreateType('LINK'); titleFetch.reset(); }}>网址</button>
              <button className={cn("flex-1 py-1.5 text-xs font-medium rounded-lg transition-all", createType==='FOLDER' ? "bg-white/20 shadow-sm text-fg" : "text-fg/50")} onClick={()=>{ setCreateType('FOLDER'); titleFetch.reset(); }}>文件夹</button>
            </div>

            {createType === 'LINK' && (
              <div className="space-y-1">
                <label className="text-xs text-fg/60">网址</label>
                <Input 
                  value={createUrl} 
                  onChange={e => {
                    const val = e.target.value
                    setCreateUrl(val)
                    // 触发标题获取
                    if (val.trim()) {
                      titleFetch.fetchTitle(val)
                    } else {
                      titleFetch.reset()
                      // 如果名称是自动获取的，清空名称
                      if (createNameSource === 'auto') {
                        setCreateName('')
                        setCreateNameSource('none')
                      }
                    }
                  }}
                  onBlur={() => {
                    const n = normalizeUrl(createUrl)
                    if (n) {
                      setCreateUrl(n)
                      // 再次触发获取（使用规范化后的 URL）
                      titleFetch.fetchTitle(n)
                    }
                    // 如果获取到了标题且名称来源不是用户输入，自动填充
                    if (createNameSource === 'none' && (titleFetch.title || titleFetch.fallback)) {
                      setCreateName(titleFetch.title || titleFetch.fallback || '')
                      setCreateNameSource('auto')
                    }
                  }}
                  placeholder="example.com" 
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-fg/60">{createType === 'FOLDER' ? '名称' : '名称（可选）'}</label>
                {titleFetch.loading && createType === 'LINK' && (
                  <Loader2 className="w-3 h-3 animate-spin text-fg/40" />
                )}
              </div>
              <Input 
                value={createName} 
                onChange={e => {
                  setCreateName(e.target.value)
                  // 用户手动输入，标记为用户来源
                  if (e.target.value.trim()) {
                    setCreateNameSource('user')
                  }
                }}
                placeholder={createType === 'LINK' ? (titleFetch.fallback || '自动获取或手动输入') : ''}
                autoFocus={createType === 'FOLDER'}
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-fg/60">备注</label>
              <Input value={createNote} onChange={e=>setCreateNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>取消</Button>
              <Button variant="primary" onClick={handleCreate}>创建</Button>
            </div>
          </div>
        </div>
      )}

      {/* 保存排序提示对话框 */}
      {savePromptOpen && pendingOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => {
            // 不保存，恢复原顺序
            if (originalOrder) {
              order.setOrder(originalOrder)
            }
            setSavePromptOpen(false)
            setPendingOrder(null)
            setOriginalOrder(null)
          }} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">保存排序</h3>
            <p className="text-sm text-fg/70 mt-2">
              当前使用的是自动排序模式，是否将拖拽后的顺序保存为自定义排序？
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => {
                // 不保存，恢复原顺序
                if (originalOrder) {
                  order.setOrder(originalOrder)
                }
                setSavePromptOpen(false)
                setPendingOrder(null)
                setOriginalOrder(null)
              }}>不保存</Button>
              <Button variant="primary" onClick={() => {
                // 保存为自定义排序
                if (pendingOrder) {
                  order.persist(pendingOrder)
                  order.setOrder(pendingOrder)
                  setSortMode('custom')
                  toast.success('已保存为自定义排序')
                }
                setSavePromptOpen(false)
                setPendingOrder(null)
                setOriginalOrder(null)
              }}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑对话框 */}
      {editOpen && editItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">编辑{editItem.type==='FOLDER'?'文件夹':'书签'}</h3>
            <div className="space-y-1">
              <label className="text-xs text-fg/60">名称</label>
              <Input value={editName} onChange={e=>setEditName(e.target.value)} />
            </div>
            {editItem.type === 'LINK' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-fg/60">网址</label>
                  <Input value={editUrl} onChange={e=>setEditUrl(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-fg/60">备注</label>
                  <Input value={editNote} onChange={e=>setEditNote(e.target.value)} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>取消</Button>
              <Button variant="primary" onClick={async () => {
                if(!token || !editItem) return;
                const body: { name: string; url?: string; note?: string } = { name: editName };
                if(editItem.type === 'LINK') {
                  body.url = normalizeUrl(editUrl);
                  body.note = editNote;
                }
                const resp = await apiFetch(`/api/bookmarks/${editItem.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
                if(resp.ok) {
                  toast.success('已更新');
                  setEditOpen(false);
                  await load();
                } else {
                  toast.error(resp.message);
                }
              }}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {/* 登录提示模态框 */}
      {loginPromptOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLoginPromptOpen(false)} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">需要登录</h3>
            <p className="text-sm text-fg/70">
              登录后即可添加和管理书签，数据将自动同步到云端。
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setLoginPromptOpen(false)}>取消</Button>
              <Button variant="primary" onClick={() => { setLoginPromptOpen(false); onClose(); navigate('/login'); }}>去登录</Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
