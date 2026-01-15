/**
 * 管理后台书签管理标签页
 * 支持按用户分组显示和热力榜单
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  Flame,
  Users,
  MousePointerClick,
  Bookmark,
  Edit2,
  ExternalLink,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { apiFetch } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { cn } from '../../utils/cn'
import { compareNames } from '../../utils/sortBookmarks'

// --- Types ---

type BookmarkType = 'LINK' | 'FOLDER'

type BookmarkWithStats = {
  id: string
  name: string
  url: string | null
  type: BookmarkType
  parentId: string | null
  siteId: string | null
  userClicks: number
  globalClicks: number
  createdAt: string
}

type UserStats = {
  user: {
    id: string
    username: string
    nickname: string
    role: 'USER' | 'ADMIN' | 'ROOT'
  }
  bookmarkCount: number
  totalClicks: number
  bookmarks: BookmarkWithStats[]
}

type HeatRankingItem = {
  siteId: string
  siteName: string
  globalClicks: number
  uniqueUsers: number
}

// --- Components ---

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'outline' | 'heat' }) {
  const styles = {
    default: 'bg-glass/10 text-fg/80 border-glass-border/20',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    outline: 'border border-glass-border/30 text-fg/60',
    heat: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', styles[variant])}>
      {children}
    </span>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass-panel rounded-2xl p-4 sm:p-5', className)}>{children}</div>
}

// 获取 favicon URL
function getFaviconUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return null
  }
}

// 书签图标组件
function BookmarkIcon({ url, name }: { url: string | null; name: string }) {
  const [faviconOk, setFaviconOk] = useState(true)
  const favicon = getFaviconUrl(url)
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase()

  if (favicon && faviconOk) {
    return (
      <img
        src={favicon}
        alt=""
        className="w-5 h-5 rounded"
        onError={() => setFaviconOk(false)}
      />
    )
  }

  return (
    <div className="w-5 h-5 rounded bg-primary/15 text-primary text-xs font-medium flex items-center justify-center">
      {letter}
    </div>
  )
}

// 编辑书签对话框
function EditBookmarkDialog({
  bookmark,
  onClose,
  onSave,
}: {
  bookmark: BookmarkWithStats
  onClose: () => void
  onSave: (id: string, data: { name: string; url: string }) => Promise<void>
}) {
  const [name, setName] = useState(bookmark.name)
  const [url, setUrl] = useState(bookmark.url || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return toast.warning('名称不能为空')
    if (!url.trim()) return toast.warning('网址不能为空')
    setSaving(true)
    try {
      await onSave(bookmark.id, { name: name.trim(), url: url.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-modal rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="font-semibold text-lg">编辑书签</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-fg/70 mb-1 block">名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="书签名称" />
          </div>
          <div>
            <label className="text-sm text-fg/70 mb-1 block">网址</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}


// 角色徽章
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; variant: 'error' | 'warning' | 'default' }> = {
    ROOT: { label: '超管', variant: 'error' },
    ADMIN: { label: '管理', variant: 'warning' },
    USER: { label: '用户', variant: 'default' },
  }
  const { label, variant } = map[role] ?? { label: role, variant: 'default' as const }
  return <Badge variant={variant}>{label}</Badge>
}

// 热力条
function HeatBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full bg-glass/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// 分页组件
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <Button variant="ghost" size="sm" onClick={() => onPageChange(1)} disabled={page === 1}>
        <ChevronsLeft className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="px-3 text-sm text-fg/70">
        {page} / {totalPages}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onPageChange(totalPages)} disabled={page === totalPages}>
        <ChevronsRight className="w-4 h-4" />
      </Button>
    </div>
  )
}

// 用户书签分组
function UserBookmarkGroup({
  stats,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  stats: UserStats
  expanded: boolean
  onToggle: () => void
  onEdit: (b: BookmarkWithStats) => void
  onDelete: (id: string) => void
}) {
  const { user, bookmarkCount, totalClicks, bookmarks } = stats
  // 过滤出链接类型并按名称 A-Z 排序（支持中文拼音）
  const links = bookmarks
    .filter((b) => b.type === 'LINK')
    .sort((a, b) => compareNames(a.name, b.name))

  return (
    <Card className="mb-3">
      <div className="flex items-center gap-3 cursor-pointer select-none" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-4 h-4 text-fg/50" /> : <ChevronRight className="w-4 h-4 text-fg/50" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{user.nickname || user.username}</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="text-xs text-fg/50 mt-0.5">@{user.username}</div>
        </div>
        {/* 统计数字对齐 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5" title="书签数量">
            <Bookmark className="w-4 h-4 text-fg/40" />
            <span className="w-6 text-center tabular-nums text-sm">{bookmarkCount}</span>
          </div>
          <div className="flex items-center gap-1.5" title="总点击次数">
            <MousePointerClick className="w-4 h-4 text-fg/40" />
            <span className="w-6 text-center tabular-nums text-sm">{totalClicks}</span>
          </div>
        </div>
      </div>

      {expanded && links.length > 0 && (
        <div className="mt-3 pt-3 border-t border-glass-border/20 space-y-1">
          {/* 表头 */}
          <div className="flex items-center gap-2 py-1 px-2 text-xs text-fg/40">
            <span className="w-5 shrink-0" />
            <span className="flex-1">书签名称</span>
            <div className="flex gap-2 shrink-0">
              <span className="w-12 text-center">个人</span>
              <span className="w-12 text-center">全局</span>
            </div>
            <span className="w-[72px] shrink-0" />
          </div>
          {links.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-glass/5 group">
              <BookmarkIcon url={b.url} name={b.name} />
              <span className="flex-1 truncate text-sm">{b.name}</span>
              {/* 点击数对齐 - 数字居中 */}
              <div className="flex gap-2 shrink-0">
                <span 
                  className="w-12 text-center tabular-nums text-xs py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400" 
                  title="该用户对此站点的点击次数"
                >
                  {b.userClicks}
                </span>
                <span 
                  className="w-12 text-center tabular-nums text-xs py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400" 
                  title="所有用户对此站点的总点击次数"
                >
                  {b.globalClicks}
                </span>
              </div>
              <div className="flex gap-1 w-[72px] justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                {b.url && (
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-glass/10 rounded" title="打开链接">
                    <ExternalLink className="w-3.5 h-3.5 text-fg/40" />
                  </a>
                )}
                <button onClick={() => onEdit(b)} className="p-1 hover:bg-glass/10 rounded" title="编辑书签">
                  <Edit2 className="w-3.5 h-3.5 text-fg/40" />
                </button>
                <button onClick={() => onDelete(b.id)} className="p-1 hover:bg-red-500/10 rounded" title="删除书签">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {expanded && links.length === 0 && (
        <div className="mt-3 pt-3 border-t border-glass-border/20 text-sm text-fg/40 text-center py-2">
          暂无链接书签
        </div>
      )}
    </Card>
  )
}

// 热力榜单卡片
function HeatRankingCard({ ranking }: { ranking: HeatRankingItem[] }) {
  const maxClicks = Math.max(...ranking.map((r) => r.globalClicks), 1)

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold">热力榜单</h3>
      </div>
      {ranking.length === 0 ? (
        <div className="text-sm text-fg/40 text-center py-4">暂无数据</div>
      ) : (
        <div className="space-y-3">
          {ranking.map((item, idx) => (
            <div key={item.siteId} className="flex items-center gap-3">
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                idx === 0 ? 'bg-yellow-500/20 text-yellow-600' :
                idx === 1 ? 'bg-gray-400/20 text-gray-500' :
                idx === 2 ? 'bg-orange-600/20 text-orange-600' :
                'bg-glass/10 text-fg/50'
              )}>
                {idx + 1}
              </span>
              <BookmarkIcon url={item.siteId} name={item.siteName} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.siteName}</div>
                <HeatBar value={item.globalClicks} max={maxClicks} />
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{item.globalClicks}</div>
                <div className="text-xs text-fg/40">{item.uniqueUsers} 人</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// --- Main Component ---

const PAGE_SIZE = 10

export function BookmarksTab() {
  const token = useAuthStore((s) => s.token)
  const [view, setView] = useState<'users' | 'heat'>('users')
  const [loading, setLoading] = useState(false)
  const [userStats, setUserStats] = useState<UserStats[]>([])
  const [heatRanking, setHeatRanking] = useState<HeatRankingItem[]>([])
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [editingBookmark, setEditingBookmark] = useState<BookmarkWithStats | null>(null)
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [statsRes, heatRes] = await Promise.all([
        apiFetch<{ userStats: UserStats[] }>('/api/admin/bookmarks/stats', { token }),
        apiFetch<{ ranking: HeatRankingItem[] }>('/api/admin/bookmarks/heat-ranking?limit=20', { token }),
      ])
      if (statsRes.ok) setUserStats(statsRes.data.userStats ?? [])
      else toast.error(statsRes.message || '加载书签统计失败')
      if (heatRes.ok) setHeatRanking(heatRes.data.ranking ?? [])
      else toast.error(heatRes.message || '加载热力榜失败')
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 分页
  const totalPages = Math.ceil(userStats.length / PAGE_SIZE)
  const pagedUsers = userStats.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleEditSave = async (id: string, data: { name: string; url: string }) => {
    const res = await apiFetch(`/api/admin/bookmarks/${id}`, { method: 'PATCH', body: JSON.stringify(data), token: token || undefined })
    if (!res.ok) throw new Error(res.message)
    toast.success('已保存')
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此书签？')) return
    try {
      const res = await apiFetch(`/api/admin/bookmarks/${id}`, { method: 'DELETE', token: token || undefined })
      if (!res.ok) throw new Error(res.message)
      toast.success('已删除')
      fetchData()
    } catch (e: any) {
      toast.error(e?.message || '删除失败')
    }
  }

  return (
    <div className="space-y-4">
      {/* 视图切换 */}
      <div className="flex gap-2">
        <Button
          variant={view === 'users' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setView('users')}
        >
          <Users className="w-4 h-4 mr-1" />
          用户书签
        </Button>
        <Button
          variant={view === 'heat' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setView('heat')}
        >
          <Flame className="w-4 h-4 mr-1" />
          热力榜单
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-fg/50">加载中...</div>
      ) : view === 'users' ? (
        <>
          {pagedUsers.map((stats) => (
            <UserBookmarkGroup
              key={stats.user.id}
              stats={stats}
              expanded={expandedUsers.has(stats.user.id)}
              onToggle={() => toggleUser(stats.user.id)}
              onEdit={setEditingBookmark}
              onDelete={handleDelete}
            />
          ))}
          {userStats.length === 0 && (
            <div className="text-center py-8 text-fg/50">暂无用户数据</div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <HeatRankingCard ranking={heatRanking} />
      )}

      {editingBookmark && (
        <EditBookmarkDialog
          bookmark={editingBookmark}
          onClose={() => setEditingBookmark(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}
