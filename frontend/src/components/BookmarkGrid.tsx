import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { cn } from '../utils/cn'
import { normalizeUrl } from '../utils/url'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Tooltip } from './ui/Tooltip'
import { ArrowLeft, Folder, Loader2, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useBookmarkOrder } from './bookmarks/useBookmarkOrder'
import { useBookmarkDrag } from './bookmarks/useBookmarkDrag'
import { getOrder, saveOrder, storageKey } from './bookmarks/orderStorage'
import { useBookmarkDndStore } from '../stores/bookmarkDnd'
import { useBookmarkDrawerStore } from '../stores/bookmarkDrawer'
import { useShortcutSet } from './bookmarks/useShortcutSet'
import { useTitleFetch } from '../hooks/useTitleFetch'
import { useClickTracker } from '../hooks/useClickTracker'

// 快捷栏最大行数
const MAX_ROWS = 3
// 每行图标数量（根据屏幕宽度不同）
const getItemsPerRow = () => {
  if (typeof window === 'undefined') return 8
  const width = window.innerWidth
  if (width >= 1024) return 8 // lg
  if (width >= 768) return 6  // md
  if (width >= 640) return 5  // sm
  return 4
}

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
        transition: 'opacity 150ms',
      }}
      onPointerDown={(e) => {
        onPointerDown(item.id, e)
      }}
      onClick={(e) => {
        // 如果正在拖拽，阻止点击事件
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

export function BookmarkGrid() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const openDrawer = useBookmarkDrawerStore((s) => s.setOpen)

  // --- State ---

  const [allItems, setAllItems] = useState<Bookmark[]>([]) // Flat list
  const [loading, setLoading] = useState(false)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null) // null = Root

  // UI States
  const [menu, setMenu] = useState<MenuState>({ open: false })
  const menuRef = useRef<HTMLDivElement | null>(null)

  // --- Drag state (dnd-kit) ---
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

  // --- Shortcut Set ---
  const {
    shortcutIds,
    addShortcut,
    removeShortcut,
    cleanupInvalidIds,
  } = useShortcutSet(user?.id)

  // --- Click Tracker ---
  const { trackClick } = useClickTracker()

  // --- Computed ---
  
  const availableFolders = useMemo(() => {
    return allItems.filter(x => x.type === 'FOLDER' && x.id !== activeFolderId)
  }, [allItems, activeFolderId])

  // Get items for current view (Root or specific Folder)
  // 快捷栏只显示在 shortcutSet 中的书签
  const currentItems = useMemo(() => {
    const shortcutIdSet = new Set(shortcutIds)
    return allItems.filter((x) => {
      // 必须在当前文件夹层级
      if (x.parentId !== activeFolderId) return false
      // 根目录时，只显示在 shortcutSet 中的书签
      if (activeFolderId === null) {
        return shortcutIdSet.has(x.id)
      }
      // 在文件夹内时，显示所有书签
      return true
    })
  }, [allItems, activeFolderId, shortcutIds])

  const idToItem = useMemo(() => {
    const m = new Map<string, Bookmark>()
    for (const it of currentItems) m.set(it.id, it)
    return m
  }, [currentItems])

  const order = useBookmarkOrder({
    userId: user?.id,
    folderId: activeFolderId,
    itemIds: currentItems.map((x) => x.id),
    context: 'shortcut',
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
      // 清理无效的快捷方式 ID
      const validIds = resp.data.items.map(x => x.id)
      cleanupInvalidIds(validIds)
    } finally {
      setLoading(false)
    }
  }, [token, cleanupInvalidIds])

  useEffect(() => {
    void load()
  }, [load])

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

  // 打开后按真实菜单尺寸做边界修正，保证“贴鼠标且不出屏幕”
  useEffect(() => {
    if (!menu.open) return
    const el = menuRef.current
    if (!el) return
    const { x, y } = menu
    const pad = 12
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - pad
    const maxY = window.innerHeight - rect.height - pad
    const nx = Math.max(pad, Math.min(x, maxX))
    const ny = Math.max(pad, Math.min(y, maxY))
    if (nx === x && ny === y) return
    setMenu((prev) => (prev.open ? { ...prev, x: nx, y: ny } : prev))
  }, [menu])

  // --- Drag & Drop Logic (native pointer events) ---
  // 拖拽/排序/建夹逻辑已重构到 useBookmarkDrag

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
    // 1. Create Folder
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

    // 2. Move items to folder
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

    // 3. Update Order
    const currentOrder = getOrder(user!.id, activeFolderId)
    const baseOrder = currentOrder.length ? currentOrder : visibleIds
    const baseIdx = baseOrder.indexOf(baseItem.id)
    
    // Replace baseItem with folder
    if (baseIdx !== -1) {
      baseOrder.splice(baseIdx, 1, folder.id)
    } else {
      baseOrder.push(folder.id)
    }
    // Remove incomingItem from current level (filter out)
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
        parentId: createParentId // Create in current or specified
      }),
    })
    
    if (!resp.ok) return toast.error(resp.message)
    toast.success('已创建')
    setCreateOpen(false)
    resetCreateForm()
    
    // 快捷栏创建的书签自动添加到快捷方式集合（仅 LINK 类型）
    if (createType === 'LINK') {
      addShortcut(resp.data.item.id)
    }
    
    // Append to current order
    const pid = createParentId ?? activeFolderId
    // 关键：如果当前层级还没有持久化顺序（localStorage 为空），直接 append 会导致新项走“extras”顺序（可能被接口返回顺序放到最前）。
    // 所以这里以“当前正在显示的顺序”为基准，把新项追加到末尾（也就是原加号的位置）。
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
      const dragItem = idToItem.get(dragId)
      if (!dragItem) return
      await moveToFolder(dragItem, folderId)
    },
    onCreateFolderWith: async (baseId: string, incomingId: string) => {
      const baseItem = idToItem.get(baseId)
      const incoming = idToItem.get(incomingId)
      if (!baseItem || !incoming) return
      await createFolderWithItems(baseItem, incoming)
    },
    onPersistReorder: (ids: string[]) => {
      order.persist(ids)
      order.setOrder(ids)
    },
    options: {
      prePush: dndPrePush,
      pushAnimation: dndPushAnim,
      dropAnimation: dndDropAnim,
    },
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
          // 只在左键/主指针启动拖拽，避免右键菜单、滚轮点击等触发拖拽
          if (ev.button !== 0) return
          drag.onPointerDown(id, ev.nativeEvent, ev.currentTarget)
        }}
        onClick={(e) => {
          // 关键：如果正在拖拽（移动距离超过阈值），不执行点击
          // 需要检查 activeId 是否还在，因为如果确认是拖拽，onUp 不会立即清理 activeId
          // 只有确认是点击时，onUp 才会清理 activeId（通过 setTimeout）
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
      >
        <Tooltip
          content={b.note ? (
            <div className="space-y-1">
              <div className="font-medium">{b.name}</div>
              <div className="text-fg/70 text-xs">{b.note}</div>
            </div>
          ) : b.name}
          position="top"
          delay={600}
        >
        <div className="grid place-items-center">
          <div
            className={cn(
              'bookmark-icon h-12 w-12 rounded-[var(--start-radius)] overflow-hidden grid place-items-center transition-all duration-200 relative',
              isFolder
                ? 'bg-glass/20 border border-glass-border/20 p-[2px]'
                : showFavicon
                  ? 'bg-white/70'
                  : 'bg-primary/15 text-primary font-semibold',
              iconRing,
              showCombine && 'scale-[1.03]',
            )}
          >
            {/* 叠加创建收藏夹：在目标图标上显示“文件夹框”覆盖提示 */}
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
        </Tooltip>
      </DraggableBookmarkItem>
    )
  }

  // 未登录用户显示空状态，不强制跳转
  if (!user) {
    return (
      <div className="w-[min(720px,100%)] relative">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 justify-items-center">
              {/* 添加按钮 */}
              <button
                type="button"
                className={cn('select-none cursor-pointer outline-none focus:outline-none focus:ring-0')}
                onClick={() => setLoginPromptOpen(true)}
              >
                <div className="grid place-items-center">
                  <div className="h-12 w-12 rounded-[var(--start-radius)] grid place-items-center bg-white/60 text-fg/80 transition-all duration-300 hover:bg-white/80">
                    <span className="text-2xl leading-none">+</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-fg/70 truncate w-16 text-center">添加</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 登录提示模态框 */}
        {loginPromptOpen && createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLoginPromptOpen(false)} />
            <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="font-semibold text-lg">需要登录</h3>
              <p className="text-sm text-fg/70">
                登录后即可添加和管理书签，数据将自动同步到云端。
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setLoginPromptOpen(false)}>取消</Button>
                <Button variant="primary" onClick={() => { setLoginPromptOpen(false); navigate('/login'); }}>去登录</Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    )
  }

  return (
    <div className="w-[min(720px,100%)] relative">
      <div className="flex items-center justify-between gap-2 mb-2 h-8">
        <div className="flex items-center gap-2">
           {activeFolderId && (
             <Button variant="ghost" size="sm" onClick={() => setActiveFolderId(null)} className="h-8 px-2 -ml-2">
               <ArrowLeft className="w-4 h-4 mr-1" /> 返回
             </Button>
           )}
           <div className="text-xs text-fg/60">
             {activeFolder ? `📂 ${activeFolder.name}` : '快捷栏'}
           </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>刷新</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {/* 限制显示的图标数量：最多3行，最后一个位置留给"更多"按钮 */}
        {(() => {
          const itemsPerRow = getItemsPerRow()
          const maxItems = MAX_ROWS * itemsPerRow - 1 // 减1是为了给"更多"按钮留位置
          const hasMore = visibleIds.length > maxItems
          const displayIds = hasMore ? visibleIds.slice(0, maxItems) : visibleIds
          
          return (
            <>
              {displayIds.map((id) => idToItem.get(id)).filter(Boolean).map((it) => renderItem(it!))}
              
              {/* 更多按钮 - 当有更多书签时显示 */}
              {hasMore && (
                <button
                  type="button"
                  className={cn('select-none cursor-pointer outline-none focus:outline-none focus:ring-0')}
                  onClick={() => openDrawer(true)}
                >
                  <div className="grid place-items-center">
                    <div className="h-12 w-12 rounded-[var(--start-radius)] grid place-items-center bg-white/40 text-fg/60 transition-all duration-300 hover:bg-white/60">
                      <MoreHorizontal className="w-6 h-6" />
                    </div>
                    <div className="mt-1.5 text-[11px] text-fg/70 truncate w-16 text-center">更多</div>
                  </div>
                </button>
              )}
              
              {/* 添加按钮 - 只在没有更多书签或书签数量不满时显示 */}
              {!hasMore && (
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
                    <div className="h-12 w-12 rounded-[var(--start-radius)] grid place-items-center bg-white/60 text-fg/80 transition-all duration-300 hover:bg-white/80">
                      <span className="text-2xl leading-none">+</span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-fg/70 truncate w-16 text-center">添加</div>
                  </div>
                </button>
              )}
            </>
          )
        })()}
      </div>

      {drag.activeId
        ? createPortal(
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
                  <div className="bm-inner">
                    <div className="grid place-items-center select-none">
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
                  </div>
                )
              })()}
            </div>,
            document.body,
          )
        : null}

      {activeFolderId && (
        <div 
          className="fixed inset-0 z-[-1]" 
          onClick={() => setActiveFolderId(null)} 
          title="点击空白处返回"
        />
      )}

      {menu.open && createPortal(
         <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setMenu({open:false}) }} onContextMenu={(e)=>{e.preventDefault();setMenu({open:false})}}>
           <div 
             className="fixed z-[61] glass-panel-strong rounded-[var(--start-radius)] p-2 w-48 border border-glass-border/25 shadow-xl"
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
                   {/* 移除快捷方式（非破坏性操作） */}
                   <Button variant="ghost" className="w-full justify-start h-8 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50/10" onClick={() => { setMenu({open:false}); removeShortcut(menu.item.id); toast.success('已从快捷栏移除'); }}>移除快捷方式</Button>
                   {/* Move to Folder Options */}
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
              <Button variant="ghost" className="w-full justify-start h-8 text-sm" onClick={() => { setMenu({open:false}); toast.info('直接拖拽即可整理/创建收藏夹'); }}>移动/整理</Button>
           </div>
         </div>,
         document.body
      )}

      {deleteOpen && deleteItem && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} />
           <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="font-semibold text-lg">确认删除</h3>
              <p className="text-sm text-fg/70 mt-2">
                确定要删除 {deleteItem.type === 'FOLDER' ? '收藏夹' : '书签'} “{deleteItem.name}” 吗？
                {deleteItem.type === 'FOLDER' && <br/>}
                {deleteItem.type === 'FOLDER' && <span className="text-xs text-fg/50 block mt-1">文件夹内的书签将移动到上一级。</span>}
              </p>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setDeleteOpen(false)}>取消</Button>
                <Button variant="primary" className="bg-red-600 border-red-600 hover:bg-red-700 text-white" onClick={async () => {
                   setDeleteOpen(false);
                   if(!token || !deleteItem) return;

                   // 删除文件夹时：把文件夹内书签按“文件夹所在位置”插回上一级顺序，后面的整体后移
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
                       // 清理被删文件夹自身的顺序缓存（可选）
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
        </div>,
        document.body
      )}

      {createOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
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
        </div>,
        document.body
      )}

      {editOpen && editItem && createPortal(
         <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
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
         </div>,
         document.body
      )}

      {/* 登录提示模态框 */}
      {loginPromptOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLoginPromptOpen(false)} />
          <div className="relative w-full max-w-sm glass-modal rounded-[var(--start-radius)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-semibold text-lg">需要登录</h3>
            <p className="text-sm text-fg/70">
              登录后即可添加和管理书签，数据将自动同步到云端。
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setLoginPromptOpen(false)}>取消</Button>
              <Button variant="primary" onClick={() => { setLoginPromptOpen(false); navigate('/login'); }}>去登录</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
