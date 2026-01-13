import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { GlobalToaster } from '../components/GlobalToaster'
import { ServerStatus } from '../components/ServerStatus'
import { Sidebar } from '../components/Sidebar'
import { SettingsDialog } from '../components/SettingsDialog'
import { MarketDialog } from '../components/MarketDialog'
import { useApplyAppearance } from '../hooks/useApplyAppearance'
import { useBackgroundImage } from '../hooks/useBackgroundImage'
import { useCloudSettingsSync } from '../hooks/useCloudSettingsSync'
import { useAppearanceStore } from '../stores/appearance'
import { useAuthStore } from '../stores/auth'
import { useSearchFocusStore } from '../stores/searchFocus'
import { cn } from '../utils/cn'

export function AppShell() {
  useApplyAppearance()
  useCloudSettingsSync()
  // 登录态恢复（token 持久化后拉一次 /me，避免刷新后 user 为空）
  const refreshMe = useAuthStore((s) => s.refreshMe)
  const token = useAuthStore((s) => s.token)

  const { backgroundUrl, bingCopyright } = useBackgroundImage()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)
  const sidebarExpanded = useAppearanceStore((s) => s.sidebarExpanded)
  const setSidebarExpanded = useAppearanceStore((s) => s.setSidebarExpanded)
  const searchFocused = useSearchFocusStore((s) => s.isFocused)

  useEffect(() => {
    if (token) void refreshMe()
  }, [refreshMe, token])

  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `url("${backgroundUrl}")`,
    }),
    [backgroundUrl],
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 背景图 - 搜索聚焦时轻微放大并模糊 */}
      <div
        className={cn(
          'absolute inset-0 bg-center bg-cover transition-all duration-500 ease-out',
          searchFocused ? 'scale-[1.05] blur-sm' : 'scale-[1.02]',
        )}
        style={backgroundStyle}
      />

      {/* 统一遮罩：让文字更稳、更耐看 */}
      <div className="absolute inset-0 bg-white/35 dark:bg-black/60" />

      {/* 布局：侧边栏覆盖式，不挤压中间内容 */}
      <div className="relative z-10 h-full w-full">
        {/* 侧边栏展开时：点击空白处收起 */}
        {sidebarExpanded ? (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setSidebarExpanded(false)}
          />
        ) : null}
        <div
          className={cn(
            'absolute inset-y-0 left-0 z-20 transition-all duration-500 ease-out',
            searchFocused && 'blur-sm opacity-60 pointer-events-none',
          )}
        >
          <Sidebar
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMarket={() => setMarketOpen(true)}
          />
        </div>

        <main
          className="relative z-0 h-full w-full overflow-hidden transition-none"
        >
          <div className="h-full w-full flex items-center justify-center p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 背景图署名（先放这里，后续可以做成可开关） */}
      <div className="absolute bottom-3 right-4 z-20 text-xs text-fg/60 select-none">
        {bingCopyright ? `背景：${bingCopyright}` : ''}
      </div>

      {settingsOpen ? (
        <SettingsDialog open onClose={() => setSettingsOpen(false)} />
      ) : null}
      {marketOpen ? <MarketDialog open onClose={() => setMarketOpen(false)} /> : null}
      <GlobalToaster />
      <ServerStatus />
    </div>
  )
}


