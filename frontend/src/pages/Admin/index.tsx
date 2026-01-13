import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Users,
  Bookmark,
  Puzzle,
  Settings,
  UserCircle,
  RefreshCw,
  Shield,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LogOut,
  ChevronRight,
  Search,
  ArrowUpDown,
  ChevronLeft,
  Pencil,
  FileText,
  Download,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { GlobalToaster } from '../../components/GlobalToaster'
import { ServerStatus } from '../../components/ServerStatus'
import { apiFetch } from '../../services/api'
import { useApplyAppearance } from '../../hooks/useApplyAppearance'
import { useAuthStore, type User } from '../../stores/auth'
import { cn } from '../../utils/cn'
import { LogsTab } from './LogsTab'
import { UpdateTab } from './UpdateTab'

// --- Types ---

type AdminUser = User & {
  passwordHash?: string
  createdAt: string
}

type UserListResponse = {
  items: AdminUser[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type AdminBookmark = {
  id: string
  name: string
  url: string
  note: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; username: string; nickname: string; role: 'USER' | 'ADMIN' | 'ROOT' }
}

type AdminExtension = {
  id: string
  name: string
  description: string | null
  sourceUrl: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  updatedAt: string
  user: { id: string; nickname: string; role: 'USER' | 'ADMIN' | 'ROOT' }
}

// --- Components ---

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'outline' }) {
  const styles = {
    default: 'bg-glass/10 text-fg/80 border-glass-border/20',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    outline: 'border border-glass-border/30 text-fg/60',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', styles[variant])}>
      {children}
    </span>
  )
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-xl font-semibold text-fg tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-fg/60">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass-panel rounded-2xl p-4 sm:p-5', className)}>{children}</div>
}

// --- Main Page ---

export function AdminPage() {
  useApplyAppearance()
  const token = useAuthStore((s) => s.token)
  const me = useAuthStore((s) => s.user)
  const refreshMe = useAuthStore((s) => s.refreshMe)
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = Boolean(me && (me.role === 'ADMIN' || me.role === 'ROOT'))
  const isRoot = me?.role === 'ROOT'

  // 从 URL hash 读取初始 tab
  const getInitialTab = (): 'users' | 'bookmarks' | 'extensions' | 'project' | 'profile' | 'logs' | 'update' => {
    const hash = location.hash.replace('#', '')
    const validTabs = ['users', 'bookmarks', 'extensions', 'project', 'profile', 'logs', 'update']
    if (validTabs.includes(hash)) {
      return hash as typeof validTabs[number]
    }
    return 'users'
  }

  const [tab, setTabState] = useState<'users' | 'bookmarks' | 'extensions' | 'project' | 'profile' | 'logs' | 'update'>(getInitialTab)
  const [loading, setLoading] = useState(false)

  // 切换 tab 时同步更新 URL hash
  const setTab = (newTab: typeof tab) => {
    setTabState(newTab)
    window.history.replaceState(null, '', `#${newTab}`)
  }

  // Users Tab State
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userPage, setUserPage] = useState(1)
  const [userTotalPages, setUserTotalPages] = useState(1)
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState('role_asc') // Default: Role ASC (Root->Admin->User), then Time DESC

  // Other Data
  const [bookmarks, setBookmarks] = useState<AdminBookmark[]>([])
  const [extensions, setExtensions] = useState<AdminExtension[]>([])
  const [projectSettingsText, setProjectSettingsText] = useState<string>('{}')

  // Modals
  const [pwdOpen, setPwdOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [targetUser, setTargetUser] = useState<AdminUser | null>(null)
  
  // Forms
  const [pwdValue, setPwdValue] = useState('')

  // Edit Any User Profile Form
  const [editUsername, setEditUsername] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Root My Profile Form
  const [rootUsername, setRootUsername] = useState('')
  const [rootNickname, setRootNickname] = useState('')
  const [rootEmail, setRootEmail] = useState('')
  const [rootPhone, setRootPhone] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')

  // --- Actions ---

  const loadUsers = useCallback(async (p = userPage, s = userSearch, sort = userSort) => {
    if (!token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(p),
        limit: '20',
        search: s,
        sortBy: sort,
      })
      const resp = await apiFetch<UserListResponse>(`/api/admin/users?${qs.toString()}`, { method: 'GET', token })
      if (!resp.ok) return toast.error(resp.message)
      setUsers(resp.data.items)
      setUserPage(resp.data.page)
      setUserTotalPages(resp.data.totalPages)
    } finally {
      setLoading(false)
    }
  }, [token, userPage, userSearch, userSort])

  const loadBookmarks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await apiFetch<{ items: AdminBookmark[] }>('/api/admin/bookmarks', { method: 'GET', token })
      if (!resp.ok) return toast.error(resp.message)
      setBookmarks(resp.data.items)
    } finally {
      setLoading(false)
    }
  }, [token])

  const deleteBookmark = async (id: string) => {
    if (!confirm('确定要删除这条书签吗？')) return
    if (!token) return
    const resp = await apiFetch<{ id: string }>(`/api/admin/bookmarks/${id}`, { method: 'DELETE', token })
    if (!resp.ok) return toast.error(resp.message)
    toast.success('已删除书签')
    setBookmarks((prev) => prev.filter((x) => x.id !== id))
  }

  const loadExtensions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await apiFetch<{ items: AdminExtension[] }>('/api/admin/extensions', { method: 'GET', token })
      if (!resp.ok) return toast.error(resp.message)
      setExtensions(resp.data.items)
    } finally {
      setLoading(false)
    }
  }, [token])

  const reviewExtension = async (id: string, status: AdminExtension['status']) => {
    if (!token) return
    const resp = await apiFetch<{ item: AdminExtension }>(`/api/admin/extensions/${id}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success(`审核状态已更新为：${status}`)
    await loadExtensions()
  }

  const loadProjectSettings = useCallback(async () => {
    if (!token || !isRoot) return
    const resp = await apiFetch<{ settings: unknown }>('/api/admin/project-settings', { method: 'GET', token })
    if (!resp.ok) return toast.error(resp.message)
    setProjectSettingsText(JSON.stringify(resp.data.settings, null, 2))
  }, [token, isRoot])

  const saveProjectSettings = async () => {
    if (!token || !isRoot) return
    try {
      const json = JSON.parse(projectSettingsText) as unknown
      const resp = await apiFetch<{ settings: unknown }>('/api/admin/project-settings', {
        method: 'PUT',
        token,
        body: JSON.stringify(json),
      })
      if (!resp.ok) return toast.error(resp.message)
      toast.success('项目设置已保存')
      setProjectSettingsText(JSON.stringify(resp.data.settings, null, 2))
    } catch {
      toast.error('JSON 格式不正确')
    }
  }

  const setRole = async (u: AdminUser, role: 'USER' | 'ADMIN') => {
    if (!token || !isRoot) return toast.error('权限不足')
    if (u.id === me?.id) return toast.warning('不能修改自己的角色')
    const resp = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${u.id}/role`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ role }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success(`用户 ${u.nickname} 角色已更新为 ${role}`)
    loadUsers() // Reload current page
  }

  const resetPwd = async () => {
    if (!token || !isRoot || !targetUser || !pwdValue) return
    const resp = await apiFetch<{ userId: string }>(`/api/admin/users/${targetUser.id}/password`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ password: pwdValue }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success('密码已重置')
    setPwdValue('')
    setPwdOpen(false)
    setTargetUser(null)
  }
  
  const saveUserProfile = async () => {
    if (!token || !isRoot || !targetUser) return
    const resp = await apiFetch<{ user: User }>(`/api/admin/users/${targetUser.id}/profile`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        username: editUsername.trim() || undefined,
        nickname: editNickname.trim() || undefined,
        email: editEmail.trim(),
        phone: editPhone.trim(),
      }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success('用户资料已更新')
    setEditProfileOpen(false)
    setTargetUser(null)
    loadUsers() // Reload list
  }

  const saveRootProfile = async () => {
    if (!token || !isRoot) return
    const resp = await apiFetch<{ user: User }>('/api/admin/root/profile', {
      method: 'PUT',
      token,
      body: JSON.stringify({
        username: rootUsername.trim() || undefined,
        nickname: rootNickname.trim() || undefined,
        email: rootEmail.trim(),
        phone: rootPhone.trim(),
      }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success('资料已保存')
    await refreshMe()
  }

  const changeMyPassword = async () => {
    if (!token || !isRoot) return
    if (!oldPwd || !newPwd) return toast.warning('请填写完整')
    const resp = await apiFetch<{ ok: true }>('/api/admin/root/password', {
      method: 'PUT',
      token,
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    })
    if (!resp.ok) return toast.error(resp.message)
    toast.success('密码已修改')
    setOldPwd('')
    setNewPwd('')
  }

  // --- Effects ---

  useEffect(() => {
    if (!isAdmin) return
    if (tab === 'users') void loadUsers(1, '', 'role_asc') // Reset on tab switch
    if (tab === 'bookmarks') void loadBookmarks()
    if (tab === 'extensions') void loadExtensions()
    if (tab === 'project') void loadProjectSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin])

  useEffect(() => {
    if (isRoot && me) {
      setRootUsername(me.username)
      setRootNickname(me.nickname)
      setRootEmail(me.email ?? '')
      setRootPhone(me.phone ?? '')
    }
  }, [isRoot, me])
  
  // Debounced search trigger could be added, here we rely on manual refresh or enter key for simplicity 
  // or simple effect on search change with debounce. For now, we'll just add a search button or trigger on Enter.

  // --- Renders ---

  if (!me) return <Navigate to="/login" replace state={{ from: location }} />
  if (!isAdmin) return <Navigate to="/" replace />

  const NavItem = ({ id, label, icon: Icon }: { id: typeof tab; label: string; icon: LucideIcon }) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium',
        tab === id
          ? 'bg-primary text-primary-fg shadow-md shadow-primary/20'
          : 'text-fg/70 hover:bg-glass/10 hover:text-fg'
      )}
    >
      <Icon className="w-5 h-5" />
      {label}
      {tab === id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
    </button>
  )

  const openEditProfile = (u: AdminUser) => {
    setTargetUser(u)
    setEditUsername(u.username)
    setEditNickname(u.nickname)
    setEditEmail(u.email || '')
    setEditPhone(u.phone || '')
    setEditProfileOpen(true)
  }

  return (
    <div className="min-h-screen w-full bg-bg text-fg font-sans selection:bg-primary/20">
      <ServerStatus />
      <div className="fixed inset-0 bg-fixed bg-cover bg-center opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'url("/grid-pattern.svg")' }} />

      <div className="relative max-w-[1600px] mx-auto h-screen flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-glass-border/10 bg-glass/20 backdrop-blur-xl z-20 dark:bg-glass/5">
          <div className="p-6">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-fg font-bold text-lg shadow-lg shadow-primary/20">
                A
              </div>
            <div>
                <div className="font-bold text-lg leading-none text-fg">Admin</div>
                <div className="text-xs text-fg/50 mt-1 font-medium">管理控制台</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto py-2">
            <div className="px-4 py-2 text-xs font-semibold text-fg/40 uppercase tracking-wider">Management</div>
            <NavItem id="users" label="用户管理" icon={Users} />
            <NavItem id="bookmarks" label="书签管理" icon={Bookmark} />
            <NavItem id="extensions" label="插件审核" icon={Puzzle} />

            <div className="px-4 py-2 mt-6 text-xs font-semibold text-fg/40 uppercase tracking-wider">System</div>
            <NavItem id="logs" label="日志查看" icon={FileText} />
            {isRoot && <NavItem id="update" label="系统更新" icon={Download} />}
            <NavItem id="project" label="项目设置" icon={Settings} />
            {isRoot && <NavItem id="profile" label="我的资料" icon={UserCircle} />}
          </nav>

          <div className="p-4 border-t border-glass-border/10">
            <div className="glass-panel rounded-xl p-3 flex items-center gap-3 mb-3 bg-glass/10 border-glass-border/10">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                {me.nickname[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate text-fg">{me.nickname}</div>
                <div className="text-xs text-fg/50 truncate">@{me.username}</div>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-fg/60 hover:text-red-500 hover:bg-red-50/10" onClick={() => navigate('/')}>
              <LogOut className="w-4 h-4 mr-2" />
                返回前台
              </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 relative flex flex-col h-full overflow-hidden bg-bg/50">
          {/* Top Bar */}
          <header className="h-16 shrink-0 border-b border-glass-border/10 flex items-center justify-between px-6 backdrop-blur-sm bg-glass/5 z-10 sticky top-0">
            <div className="text-sm text-fg/60">
               Dashboard / <span className="text-fg font-medium">{tab === 'users' ? 'User Management' : tab}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="glass" size="sm" onClick={() => {
                if (tab === 'users') loadUsers()
                if (tab === 'bookmarks') loadBookmarks()
                if (tab === 'extensions') loadExtensions()
                if (tab === 'project') loadProjectSettings()
              }} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                刷新数据
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth">
            <div className="max-w-6xl mx-auto space-y-6 pb-20">

              {/* Users Tab */}
              {tab === 'users' && (
                <>
                  <SectionHeader
                    title="用户管理"
                    subtitle="管理系统用户、角色权限与安全设置。"
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40" />
                          <input 
                            className="h-9 pl-9 pr-3 rounded-xl bg-glass/10 border border-glass-border/20 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-48 sm:w-64"
                            placeholder="搜索用户名/昵称..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') loadUsers(1, userSearch, userSort)
                            }}
                          />
                        </div>
                        <div className="relative">
                           <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40" />
                           <select 
                             className="h-9 pl-9 pr-8 rounded-xl bg-glass/10 border border-glass-border/20 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                             value={userSort}
                             onChange={(e) => {
                               setUserSort(e.target.value)
                               loadUsers(1, userSearch, e.target.value)
                             }}
                           >
                             <option value="role_asc">权限优先 (Root &gt; User)</option>
                             <option value="created_desc">注册时间 (最新)</option>
                             <option value="created_asc">注册时间 (最早)</option>
                           </select>
                        </div>
                      </div>
                    }
                  />
                  <Card className="p-0 overflow-hidden flex flex-col min-h-[400px]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-glass/5 text-fg/60 font-medium border-b border-glass-border/10">
                          <tr>
                            <th className="px-6 py-4">用户</th>
                            <th className="px-6 py-4">角色</th>
                            <th className="px-6 py-4">联系方式</th>
                            <th className="px-6 py-4">注册时间</th>
                            {isRoot && <th className="px-6 py-4">操作</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border/5">
                          {users.map((u) => (
                            <tr key={u.id} className="hover:bg-glass/5 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-9 h-9 rounded-full flex items-center justify-center font-medium",
                                    u.role === 'ROOT' ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-glass/10 text-fg"
                                  )}>
                                    {u.nickname[0]}
                                  </div>
                                  <div>
                                    <div className="font-medium text-fg flex items-center gap-1">
                                      {u.nickname}
                                      {isRoot && u.role !== 'ROOT' && (
                                        <button 
                                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-fg/40 hover:text-primary focus:outline-none focus:opacity-100"
                                          title="编辑资料"
                                          onClick={() => openEditProfile(u)}
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="text-xs text-fg/50">@{u.username}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Badge variant={u.role === 'ROOT' ? 'error' : u.role === 'ADMIN' ? 'warning' : 'default'}>
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-xs text-fg/60 space-y-0.5">
                                <div>{u.email || '-'}</div>
                                <div>{u.phone || '-'}</div>
                              </td>
                              <td className="px-6 py-4 text-xs text-fg/60">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </td>
                              {isRoot && (
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    {u.role !== 'ROOT' && (
                                      <>
                                        <div className="flex bg-glass/10 rounded-lg p-0.5">
                            <button
                                            onClick={() => setRole(u, 'USER')}
                                            disabled={u.role === 'USER'}
                              className={cn(
                                              "px-2 py-1 rounded-md text-xs font-medium transition-all border border-glass-border/10",
                                              u.role === 'USER' ? "bg-bg text-fg shadow-sm dark:bg-glass/20" : "text-fg/50 hover:text-fg hover:bg-glass/10"
                              )}
                            >
                                            User
                            </button>
                            <button
                                            onClick={() => setRole(u, 'ADMIN')}
                                            disabled={u.role === 'ADMIN'}
                              className={cn(
                                              "px-2 py-1 rounded-md text-xs font-medium transition-all border border-glass-border/10",
                                              u.role === 'ADMIN' ? "bg-bg text-fg shadow-sm dark:bg-glass/20" : "text-fg/50 hover:text-fg hover:bg-glass/10"
                                            )}
                                          >
                                            Admin
                                          </button>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setTargetUser(u)
                                            setPwdValue('')
                                            setPwdOpen(true)
                                          }}
                                          title="重置密码"
                                        >
                                          <Shield className="w-4 h-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {users.length === 0 && !loading && (
                      <div className="p-8 text-center text-fg/50 text-sm">暂无数据</div>
                    )}
                    
                    {/* Pagination */}
                    <div className="mt-auto border-t border-glass-border/10 p-4 flex items-center justify-between">
                       <div className="text-xs text-fg/50">
                         Page {userPage} of {userTotalPages}
                       </div>
                       <div className="flex gap-2">
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           disabled={userPage <= 1}
                           onClick={() => loadUsers(userPage - 1, userSearch, userSort)}
                         >
                           <ChevronLeft className="w-4 h-4" /> 上一页
                         </Button>
                         <Button 
                           variant="ghost" 
                           size="sm"
                           disabled={userPage >= userTotalPages}
                           onClick={() => loadUsers(userPage + 1, userSearch, userSort)}
                         >
                           下一页 <ChevronRight className="w-4 h-4" />
                         </Button>
                       </div>
                    </div>
                  </Card>
                </>
              )}

              {/* Bookmarks Tab */}
              {tab === 'bookmarks' && (
                <>
                  <SectionHeader
                    title="书签管理"
                    subtitle="查看并管理所有用户创建的书签。"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {bookmarks.map((b) => (
                      <Card key={b.id} className="group hover:border-primary/30 transition-all duration-300">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="font-medium text-fg truncate">{b.name}</div>
                              {b.note && <Badge variant="outline">备注</Badge>}
                            </div>
                            <a href={b.url} target="_blank" rel="noreferrer" className="text-xs text-primary/80 hover:underline break-all block mb-3">
                              {b.url}
                            </a>
                            <div className="flex items-center gap-2 text-xs text-fg/50">
                              <UserCircle className="w-3 h-3" />
                              <span>{b.user.nickname}</span>
                              <span>·</span>
                              <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                            </div>
                            {b.note && <div className="mt-2 text-xs text-fg/70 bg-glass/5 p-2 rounded-lg">{b.note}</div>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-fg/40 hover:text-red-500 hover:bg-red-50/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteBookmark(b.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                  {bookmarks.length === 0 && !loading && (
                    <div className="text-center py-12 text-fg/50 bg-glass/5 rounded-3xl border border-glass-border/10 border-dashed">
                      暂无书签数据
                    </div>
                  )}
                </>
              )}

              {/* Extensions Tab */}
              {tab === 'extensions' && (
                <>
                   <SectionHeader
                    title="插件审核"
                    subtitle="审核用户提交的拓展插件。"
                  />
                  <div className="space-y-4">
                    {extensions.map((x) => (
                      <Card key={x.id}>
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="text-lg font-medium text-fg">{x.name}</div>
                              <Badge variant={x.status === 'APPROVED' ? 'success' : x.status === 'REJECTED' ? 'error' : 'warning'}>
                                {x.status}
                              </Badge>
                </div>
                            <div className="mt-1 text-sm text-fg/60">
                              提交者：{x.user.nickname} (@{x.user.role}) · {new Date(x.createdAt).toLocaleString()}
              </div>
                            {x.description && <div className="mt-3 text-sm text-fg/80 leading-relaxed max-w-2xl">{x.description}</div>}
                            {x.sourceUrl && (
                              <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-xs text-primary hover:underline">
                                查看源码 <ChevronRight className="w-3 h-3 ml-0.5" />
                              </a>
                            )}
            </div>
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            {x.status !== 'PENDING' && (
                              <Button variant="ghost" size="sm" onClick={() => reviewExtension(x.id, 'PENDING')}>
                                重置为待审
                              </Button>
                            )}
                            {x.status !== 'APPROVED' && (
                              <Button variant="glass" size="sm" className="text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200/50 dark:border-green-800/50" onClick={() => reviewExtension(x.id, 'APPROVED')}>
                                <CheckCircle2 className="w-4 h-4 mr-1.5" /> 通过
              </Button>
                            )}
                            {x.status !== 'REJECTED' && (
                              <Button variant="glass" size="sm" className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200/50 dark:border-red-800/50" onClick={() => reviewExtension(x.id, 'REJECTED')}>
                                <XCircle className="w-4 h-4 mr-1.5" /> 驳回
                    </Button>
                            )}
                  </div>
                </div>
                      </Card>
              ))}
                    {extensions.length === 0 && !loading && (
                       <div className="text-center py-12 text-fg/50 bg-glass/5 rounded-3xl border border-glass-border/10 border-dashed">
                        暂无插件提交
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Logs Tab */}
              {tab === 'logs' && token && <LogsTab token={token} />}

              {/* Update Tab */}
              {tab === 'update' && isRoot && <UpdateTab />}

              {/* Project Settings Tab */}
              {tab === 'project' && (
                <>
                  <SectionHeader
                    title="项目设置"
                    subtitle="编辑系统级配置 (JSON)。仅 Root 可见。"
                  />
                  {isRoot ? (
                    <Card className="flex flex-col h-[500px]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-fg/50 font-mono">config.json</div>
                        <div className="flex gap-2">
                           <Button variant="glass" size="sm" onClick={loadProjectSettings}>重置</Button>
                           <Button variant="primary" size="sm" onClick={saveProjectSettings}>保存更改</Button>
              </div>
            </div>
            <textarea
                        className="flex-1 w-full bg-glass/5 rounded-xl border border-glass-border/20 p-4 font-mono text-sm text-fg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={projectSettingsText}
              onChange={(e) => setProjectSettingsText(e.target.value)}
              spellCheck={false}
                      />
                    </Card>
                  ) : (
                    <div className="p-8 text-center text-fg/50">无权访问</div>
                  )}
                </>
              )}

              {/* Profile Tab */}
              {tab === 'profile' && isRoot && (
                <>
                  <SectionHeader
                    title="我的资料"
                    subtitle="更新管理员个人信息与安全设置。"
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <h3 className="text-lg font-medium mb-4">基本信息</h3>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-fg/70">账号</label>
                      <Input value={rootUsername} onChange={(e) => setRootUsername(e.target.value)} />
                    </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-fg/70">昵称</label>
                      <Input value={rootNickname} onChange={(e) => setRootNickname(e.target.value)} />
                    </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-fg/70">邮箱</label>
                            <Input value={rootEmail} onChange={(e) => setRootEmail(e.target.value)} placeholder="可选" />
                      </div>
                          <div className="space-y-1.5">
                             <label className="text-xs font-medium text-fg/70">手机</label>
                             <Input value={rootPhone} onChange={(e) => setRootPhone(e.target.value)} placeholder="可选" />
                      </div>
                    </div>
                        <div className="pt-2 flex justify-end">
                          <Button variant="primary" onClick={saveRootProfile}>更新资料</Button>
                    </div>
                  </div>
                    </Card>

                    <Card>
                      <h3 className="text-lg font-medium mb-4">安全设置</h3>
                      <div className="space-y-4">
                         <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                           <AlertCircle className="w-4 h-4 shrink-0" />
                           修改密码后需要重新登录。
                </div>
                         <div className="space-y-1.5">
                            <label className="text-xs font-medium text-fg/70">原密码</label>
                            <Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
                    </div>
                         <div className="space-y-1.5">
                            <label className="text-xs font-medium text-fg/70">新密码</label>
                            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                    </div>
                         <div className="pt-2 flex justify-end">
                           <Button variant="glass" onClick={changeMyPassword} disabled={!oldPwd || !newPwd}>修改密码</Button>
                    </div>
                    </div>
                    </Card>
                  </div>
                </>
            )}

          </div>
          </div>
        </main>
      </div>

      {/* Reset Password Modal */}
      {pwdOpen && targetUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPwdOpen(false)} />
          <div className="relative w-full max-w-md glass-modal rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-semibold mb-1">重置密码</h3>
            <p className="text-sm text-fg/60 mb-6">正在重置 {targetUser.nickname} (@{targetUser.username}) 的密码</p>

            <div className="space-y-4">
               <div className="space-y-2">
                 <label className="text-xs font-medium text-fg/70">新密码</label>
                 <Input
                   autoFocus
                   type="password"
                   placeholder="输入新密码"
                   value={pwdValue}
                   onChange={(e) => setPwdValue(e.target.value)}
                 />
               </div>
               <div className="flex justify-end gap-3 pt-2">
                 <Button variant="ghost" onClick={() => setPwdOpen(false)}>取消</Button>
                 <Button variant="primary" onClick={resetPwd} disabled={!pwdValue}>确认重置</Button>
               </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Any User Profile Modal (ROOT only) */}
      {editProfileOpen && targetUser && isRoot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditProfileOpen(false)} />
          <div className="relative w-full max-w-md glass-modal rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-semibold mb-1">编辑用户资料</h3>
            <p className="text-sm text-fg/60 mb-6">修改 {targetUser.nickname} (@{targetUser.username}) 的信息</p>

            <div className="space-y-4">
               <div className="space-y-1.5">
                 <label className="text-xs font-medium text-fg/70">账号</label>
                 <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
               </div>
               <div className="space-y-1.5">
                 <label className="text-xs font-medium text-fg/70">昵称</label>
                 <Input value={editNickname} onChange={(e) => setEditNickname(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-fg/70">邮箱</label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-fg/70">手机</label>
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
               </div>

               <div className="flex justify-end gap-3 pt-2">
                 <Button variant="ghost" onClick={() => setEditProfileOpen(false)}>取消</Button>
                 <Button variant="primary" onClick={saveUserProfile}>保存更改</Button>
            </div>
            </div>
          </div>
        </div>
      )}
      <GlobalToaster />
    </div>
  )
}
