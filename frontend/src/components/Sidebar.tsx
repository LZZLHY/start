import { Bookmark, Home, LogIn, LogOut, Menu, Settings, Store, User } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAppearanceStore } from '../stores/appearance'
import { useAuthStore } from '../stores/auth'
import { useBookmarkDrawerStore } from '../stores/bookmarkDrawer'
import { cn } from '../utils/cn'

type Props = {
  onOpenSettings: () => void
  onOpenMarket: () => void
}

// Helper to render label with ABSOLUTE positioning to prevent layout shifts
const SidebarLabel = ({ children, expanded }: { children: React.ReactNode; expanded: boolean }) => (
  <span
    className={cn(
      'absolute left-14 whitespace-nowrap transition-all duration-300 ease-in-out',
      expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
    )}
  >
    {children}
  </span>
)

// Helper for Icon wrapper to ensure fixed width and centering
const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="w-10 h-10 flex items-center justify-center shrink-0">
    {children}
  </div>
)

export function Sidebar({ onOpenSettings, onOpenMarket }: Props) {
  const navigate = useNavigate()
  const expanded = useAppearanceStore((s) => s.sidebarExpanded)
  const toggle = useAppearanceStore((s) => s.toggleSidebar)
  const setSidebarExpanded = useAppearanceStore((s) => s.setSidebarExpanded)
  const autoHide = useAppearanceStore((s) => s.sidebarAutoHide)
  const autoHideDelay = useAppearanceStore((s) => s.sidebarAutoHideDelay)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const openBookmarkDrawer = useBookmarkDrawerStore((s) => s.setOpen)

  // 自动隐藏相关状态
  const [isHidden, setIsHidden] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 清除隐藏定时器
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  // 启动隐藏定时器
  const startHideTimer = useCallback(() => {
    if (!autoHide) return
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      setIsHidden(true)
    }, autoHideDelay * 1000)
  }, [autoHide, autoHideDelay, clearHideTimer])

  // 鼠标进入处理
  const handleMouseEnter = useCallback(() => {
    if (!autoHide) return
    clearHideTimer()
    setIsHidden(false)
  }, [autoHide, clearHideTimer])

  // 鼠标离开处理
  const handleMouseLeave = useCallback(() => {
    if (!autoHide) return
    startHideTimer()
  }, [autoHide, startHideTimer])

  // 组件挂载时启动定时器，卸载时清理
  useEffect(() => {
    if (autoHide) {
      startHideTimer()
    }
    return () => clearHideTimer()
  }, [autoHide, startHideTimer, clearHideTimer])

  // 当 autoHide 关闭时，重置 isHidden 状态
  useEffect(() => {
    if (!autoHide) {
      setIsHidden(false)
      clearHideTimer()
    }
  }, [autoHide, clearHideTimer])

  const itemBase =
    'group relative flex items-center rounded-xl px-3 py-2 text-sm transition-colors select-none overflow-hidden' // Relative for absolute positioning
  const itemIdle = 'text-fg/85 hover:bg-glass/15 active:bg-glass/20'
  const itemActive =
    'bg-glass/20 border border-glass-border/25 text-fg shadow-glass'

  return (
    <>
      {/* 悬浮触发区域：当侧边栏隐藏时，保持原来侧边栏收缩状态的位置可以触发显示 */}
      {autoHide && isHidden && (
        <div
          className="fixed left-0 top-0 h-full z-50"
          style={{ width: 'calc(4rem + 2rem)' }} // w-16 (64px) + m-4*2 (32px) = 96px
          onMouseEnter={handleMouseEnter}
        />
      )}
      <aside
        className={cn(
          'glass-panel-strong m-4 rounded-2xl h-[calc(100%-2rem)]',
          'flex flex-col overflow-hidden transition-[width,transform] duration-300 ease-in-out will-change-[width,transform]',
          expanded ? 'w-64' : 'w-16',
          autoHide && isHidden && '-translate-x-[calc(100%+1rem)]',
        )}
        onClick={() => {
          if (!expanded) setSidebarExpanded(true)
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      <div className="flex items-center px-2 pt-2 relative h-14">
        <button
          type="button"
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 z-10', // z-10 to stay above text if overlap
            'hover:bg-glass/15 active:bg-glass/20',
          )}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
          title={expanded ? '收起' : '展开'}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className={cn(
          "absolute left-14 top-1/2 -translate-y-1/2 flex flex-col justify-center min-w-0 transition-all duration-300 ease-in-out whitespace-nowrap",
          expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"
        )}>
            <div className="text-sm font-semibold leading-none">Start</div>
            <div className="text-xs text-fg/60 mt-1 leading-none">
              起始页 · frosted
            </div>
          </div>
      </div>

      <nav className="mt-3 flex flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(itemBase, isActive ? itemActive : itemIdle)
          }
          title="起始页"
        >
          <IconWrapper>
            <Home className="h-5 w-5" />
          </IconWrapper>
          <SidebarLabel expanded={expanded}>起始页</SidebarLabel>
        </NavLink>

        <button
          type="button"
          className={cn(itemBase, itemIdle, 'text-left')}
          onClick={onOpenSettings}
          title="设置"
        >
          <IconWrapper>
            <Settings className="h-5 w-5" />
          </IconWrapper>
          <SidebarLabel expanded={expanded}>设置</SidebarLabel>
        </button>

        <button
          type="button"
          className={cn(itemBase, itemIdle, 'text-left')}
          onClick={() => {
            if (expanded) {
              navigate('/')
              // 延迟一点打开抽屉，确保已经在首页
              setTimeout(() => openBookmarkDrawer(true), 50)
            } else {
              setSidebarExpanded(true)
            }
          }}
          title="我的书签"
        >
          <IconWrapper>
            <Bookmark className="h-5 w-5" />
          </IconWrapper>
          <SidebarLabel expanded={expanded}>我的书签</SidebarLabel>
        </button>

        <button
          type="button"
          className={cn(itemBase, itemIdle, 'text-left')}
          onClick={() => (expanded ? onOpenMarket() : setSidebarExpanded(true))}
          title="拓展商城"
        >
          <IconWrapper>
            <Store className="h-5 w-5" />
          </IconWrapper>
          <SidebarLabel expanded={expanded}>拓展商城</SidebarLabel>
        </button>

        {user ? (
          <button
            type="button"
            className={cn(itemBase, itemIdle, 'text-left')}
            onClick={() => {
              logout()
              toast.info('已退出登录')
            }}
            title="退出登录"
          >
            <IconWrapper>
              <LogOut className="h-5 w-5" />
            </IconWrapper>
            <SidebarLabel expanded={expanded}>退出登录</SidebarLabel>
          </button>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              cn(itemBase, isActive ? itemActive : itemIdle)
            }
            title="登录"
          >
            <IconWrapper>
              <LogIn className="h-5 w-5" />
            </IconWrapper>
            <SidebarLabel expanded={expanded}>登录</SidebarLabel>
          </NavLink>
        )}
      </nav>

      <div className="mt-auto p-3 text-xs text-fg/60 overflow-hidden relative h-10">
        <div className={cn(
           "absolute left-3 top-1/2 -translate-y-1/2 transition-all duration-300 ease-in-out whitespace-nowrap",
           expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"
        )}>
            {user ? (
              <div className="flex items-center gap-2">
              <User className="h-4 w-4 shrink-0" />
                <span className="truncate">已登录：{user.nickname}</span>
              </div>
            ) : (
            <div>登录后可同步数据</div>
            )}
          </div>
      </div>
      </aside>
    </>
  )
}
