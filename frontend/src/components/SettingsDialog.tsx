import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X, History, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAppearanceStore,
  type BackgroundType,
  type ClockHourCycle,
  type SearchEngine,
  type ThemeMode,
} from '../stores/appearance'
import { useAuthStore } from '../stores/auth'
import { useBookmarkDndStore } from '../stores/bookmarkDnd'
import { cn } from '../utils/cn'
import { applySettingsFile, createSettingsFile } from '../utils/settingsFile'
import { isValidCustomSearchUrl } from '../utils/searchEngine'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { ChangelogDialog } from './ChangelogDialog'

type Props = {
  open: boolean
  onClose: () => void
}

function isValidHex(v: string) {
  const s = v.trim()
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(s)
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="text-sm font-semibold text-fg/90">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-10 px-3 rounded-xl text-sm font-medium transition-colors',
        'border',
        active
          ? 'bg-primary text-primary-fg border-transparent'
          : 'bg-glass/10 text-fg border-glass-border/20 hover:bg-glass/15',
      )}
    >
      {children}
    </button>
  )
}

export function SettingsDialog({ open, onClose }: Props) {
  const mode = useAppearanceStore((s) => s.mode)
  const accent = useAppearanceStore((s) => s.accent)
  const backgroundType = useAppearanceStore((s) => s.backgroundType)
  const backgroundCustomUrl = useAppearanceStore((s) => s.backgroundCustomUrl)
  const clockHourCycle = useAppearanceStore((s) => s.clockHourCycle)
  const clockShowSeconds = useAppearanceStore((s) => s.clockShowSeconds)
  const clockShowDate = useAppearanceStore((s) => s.clockShowDate)
  const clockFollowAccent = useAppearanceStore((s) => s.clockFollowAccent)
  const cornerRadius = useAppearanceStore((s) => s.cornerRadius)
  const sidebarAutoHide = useAppearanceStore((s) => s.sidebarAutoHide)
  const sidebarAutoHideDelay = useAppearanceStore((s) => s.sidebarAutoHideDelay)
  const searchEngine = useAppearanceStore((s) => s.searchEngine)
  const customSearchUrl = useAppearanceStore((s) => s.customSearchUrl)
  const searchHistoryCount = useAppearanceStore((s) => s.searchHistoryCount)
  const searchRowHeight = useAppearanceStore((s) => s.searchRowHeight)
  const searchGlowBorder = useAppearanceStore((s) => s.searchGlowBorder)
  const searchGlowLight = useAppearanceStore((s) => s.searchGlowLight)
  const searchGlowLightMove = useAppearanceStore((s) => s.searchGlowLightMove)
  const bookmarkDrawerSortMode = useAppearanceStore((s) => s.bookmarkDrawerSortMode)
  const bookmarkSortLocked = useAppearanceStore((s) => s.bookmarkSortLocked)
  const dndPrePush = useBookmarkDndStore((s) => s.prePush)
  const dndPushAnim = useBookmarkDndStore((s) => s.pushAnimation)
  const dndDropAnim = useBookmarkDndStore((s) => s.dropAnimation)

  const setMode = useAppearanceStore((s) => s.setMode)
  const setAccent = useAppearanceStore((s) => s.setAccent)
  const setBackgroundType = useAppearanceStore((s) => s.setBackgroundType)
  const setBackgroundCustomUrl = useAppearanceStore((s) => s.setBackgroundCustomUrl)
  const resetAppearance = useAppearanceStore((s) => s.resetAppearance)
  const setClockHourCycle = useAppearanceStore((s) => s.setClockHourCycle)
  const setClockShowSeconds = useAppearanceStore((s) => s.setClockShowSeconds)
  const setClockShowDate = useAppearanceStore((s) => s.setClockShowDate)
  const setClockFollowAccent = useAppearanceStore((s) => s.setClockFollowAccent)
  const setCornerRadius = useAppearanceStore((s) => s.setCornerRadius)
  const setSidebarAutoHide = useAppearanceStore((s) => s.setSidebarAutoHide)
  const setSidebarAutoHideDelay = useAppearanceStore((s) => s.setSidebarAutoHideDelay)
  const setSearchEngine = useAppearanceStore((s) => s.setSearchEngine)
  const setCustomSearchUrl = useAppearanceStore((s) => s.setCustomSearchUrl)
  const setSearchHistoryCount = useAppearanceStore((s) => s.setSearchHistoryCount)
  const setSearchRowHeight = useAppearanceStore((s) => s.setSearchRowHeight)
  const setSearchGlowBorder = useAppearanceStore((s) => s.setSearchGlowBorder)
  const setSearchGlowLight = useAppearanceStore((s) => s.setSearchGlowLight)
  const setSearchGlowLightMove = useAppearanceStore((s) => s.setSearchGlowLightMove)
  const setBookmarkDrawerSortMode = useAppearanceStore((s) => s.setBookmarkDrawerSortMode)
  const setBookmarkSortLocked = useAppearanceStore((s) => s.setBookmarkSortLocked)
  const setDndPrePush = useBookmarkDndStore((s) => s.setPrePush)
  const setDndPushAnim = useBookmarkDndStore((s) => s.setPushAnimation)
  const setDndDropAnim = useBookmarkDndStore((s) => s.setDropAnimation)
  const resetBookmarkDnd = useBookmarkDndStore((s) => s.resetBookmarkDnd)

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const changePassword = useAuthStore((s) => s.changePassword)

  const [accentInput, setAccentInput] = useState(() => accent)
  const [bgUrlInput, setBgUrlInput] = useState(() => backgroundCustomUrl)
  const [nicknameInput, setNicknameInput] = useState(() => user?.nickname ?? '')
  const [customSearchUrlInput, setCustomSearchUrlInput] = useState(() => customSearchUrl)
  const [tab, setTab] = useState<'appearance' | 'clock' | 'desktop' | 'search' | 'account'>('appearance')

  // 账号设置表单状态
  const [usernameInput, setUsernameInput] = useState(() => user?.username ?? '')
  const [emailInput, setEmailInput] = useState(() => user?.email || '')
  const [phoneInput, setPhoneInput] = useState(() => user?.phone || '')
  const [profileLoading, setProfileLoading] = useState(false)

  // 密码修改表单状态
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    setNicknameInput(user?.nickname ?? '')
    setUsernameInput(user?.username ?? '')
    setEmailInput(user?.email || '')
    setPhoneInput(user?.phone || '')
    // 重置密码表单
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }, [open, user?.nickname, user?.username, user?.email, user?.phone])

  useEffect(() => {
    if (!open) return
    setCustomSearchUrlInput(customSearchUrl)
  }, [open, customSearchUrl])

  const accentHint = useMemo(() => {
    if (!accentInput.trim()) return '例如：#3b82f6'
    if (isValidHex(accentInput)) return '看起来没问题'
    return '格式不对，应该是 #RRGGBB 或 #RGB'
  }, [accentInput])

  // 账号设置验证
  const usernameValid = usernameInput.trim().length >= 3 && usernameInput.trim().length <= 32
  const nicknameValid = nicknameInput.trim().length >= 2 && nicknameInput.trim().length <= 32
  const emailValid = !emailInput.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())
  const phoneValid = !phoneInput.trim() || (phoneInput.trim().length >= 6 && phoneInput.trim().length <= 32)
  const profileValid = usernameValid && nicknameValid && emailValid && phoneValid

  // 密码验证
  const newPasswordValid = newPassword.length >= 6 && newPassword.length <= 200
  const confirmPasswordValid = newPassword === confirmPassword
  const passwordFormValid = currentPassword.length > 0 && newPasswordValid && confirmPasswordValid

  // 保存资料
  const handleSaveProfile = async () => {
    if (!profileValid || !user) return
    setProfileLoading(true)
    try {
      const result = await updateProfile({
        username: usernameInput.trim(),
        nickname: nicknameInput.trim(),
        email: emailInput.trim() || null,
        phone: phoneInput.trim() || null,
      })
      if (result.ok) {
        toast.success('资料已更新')
      } else {
        toast.error(result.message)
      }
    } finally {
      setProfileLoading(false)
    }
  }

  // 修改密码
  const handleChangePassword = async () => {
    if (!passwordFormValid || !user) return
    setPasswordLoading(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.ok) {
        toast.success('密码已修改')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(result.message)
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!open) return null

  const closeAndToast = () => {
    toast.success('设置已保存')
    onClose()
  }

  const onChangeMode = (m: ThemeMode) => setMode(m)
  const onChangeBgType = (t: BackgroundType) => setBackgroundType(t)
  const onChangeHourCycle = (v: ClockHourCycle) => setClockHourCycle(v)
  const onChangeSearchEngine = (v: SearchEngine) => setSearchEngine(v)

  const onReset = () => {
    resetAppearance()
    toast('已重置外观设置')
  }

  const exportSettings = () => {
    const data = createSettingsFile()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'start-settings.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('设置已导出')
  }

  const importSettings = async (file: File) => {
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      const resp = applySettingsFile(json)
      if (!resp.ok) {
        toast.error(resp.message)
        return
      }
      if (resp.partial) {
        toast.warning(resp.message)
      } else {
        toast.success(resp.message)
      }
    } catch {
      toast.error('导入失败：文件不是合法 JSON')
    }
  }

  const navItem = (key: typeof tab, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        'w-full text-left rounded-xl px-3 py-2 text-sm transition-colors border',
        tab === key
          ? 'bg-primary text-primary-fg border-transparent'
          : 'bg-glass/10 text-fg border-glass-border/20 hover:bg-glass/15',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/35 dark:bg-black/60"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // 适配 16:9：调整最大宽度和高度策略
            'relative w-full max-w-4xl rounded-[var(--start-radius)] p-4 sm:p-5',
          'flex flex-col',
          'h-auto max-h-[85vh] aspect-video', // 强制 16:9 比例，但受限于 max-h
          'glass-modal',
          'shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
      >
        {/* Header 固定 */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-none">设置</div>
            <div className="text-xs text-fg/60 mt-1 leading-none">
              外观系统（主题色 / 深色模式 / 背景）
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="关闭设置"
            title="关闭"
            className="h-9 w-9 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body：占满剩余空间；内部允许滚动 */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 overflow-hidden flex-1 min-h-0">
          {/* 侧边目录分类 */}
          <aside className="space-y-2 md:pr-1 min-h-0 overflow-y-auto">
            {navItem('appearance', '外观')}
            {navItem('clock', '时钟')}
            {navItem('desktop', '桌面')}
            {navItem('search', '搜索')}
            {navItem('account', '账户')}
            <div className="pt-2">
              <Button variant="ghost" onClick={onReset} className="w-full justify-start">
                重置外观
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  resetBookmarkDnd()
                  toast('已重置拖拽设置')
                }}
                className="w-full justify-start mt-2"
              >
                重置拖拽
              </Button>
            </div>
          </aside>

          {/* 右侧内容：内容过长时可滚动 */}
          <div className="space-y-6 overflow-y-auto pr-1 min-h-0">
            {tab === 'appearance' ? (
              <>
                <Section title="深色模式">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={mode === 'system'}
                      onClick={() => onChangeMode('system')}
                    >
                      跟随系统
                    </SegButton>
                    <SegButton active={mode === 'light'} onClick={() => onChangeMode('light')}>
                      浅色
                    </SegButton>
                    <SegButton active={mode === 'dark'} onClick={() => onChangeMode('dark')}>
                      深色
                    </SegButton>
                  </div>
                </Section>

                <Section title="圆角">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-fg/60">
                        当前：<span className="font-medium text-fg/80">{cornerRadius}px</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCornerRadius(18)}
                        className="h-8 px-2"
                      >
                        恢复默认
                      </Button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={48}
                      step={1}
                      value={cornerRadius}
                      onChange={(e) => setCornerRadius(Number(e.target.value))}
                      className="w-full accent-[rgb(var(--primary))]"
                    />
                    <div className="text-xs text-fg/60">
                      提示：圆角会影响书签图标/弹窗等组件的外观。
                    </div>
                  </div>
                </Section>

                <Section title="主题色">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => {
                        setAccent(e.target.value)
                        setAccentInput(e.target.value)
                      }}
                      className={cn(
                        'h-10 w-12 rounded-xl border border-glass-border/25 bg-glass/10',
                        'p-1 cursor-pointer',
                      )}
                      title="选择主题色"
                      aria-label="选择主题色"
                    />

                    <div className="flex-1">
                      <Input
                        value={accentInput}
                        onChange={(e) => {
                          const v = e.target.value
                          setAccentInput(v)
                          if (isValidHex(v)) setAccent(v.trim())
                        }}
                        placeholder="#3b82f6"
                      />
                      <div
                        className={cn(
                          'mt-1 text-xs',
                          isValidHex(accentInput) ? 'text-fg/60' : 'text-red-200',
                        )}
                      >
                        {accentHint}
                      </div>
                    </div>
                  </div>
                </Section>

                <Section title="背景">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={backgroundType === 'bing'}
                      onClick={() => onChangeBgType('bing')}
                    >
                      必应每日一图
                    </SegButton>
                    <SegButton
                      active={backgroundType === 'custom'}
                      onClick={() => onChangeBgType('custom')}
                    >
                      自定义
                    </SegButton>
                  </div>

                  {backgroundType === 'custom' ? (
                    <div className="space-y-2">
                      <Input
                        value={bgUrlInput}
                        onChange={(e) => setBgUrlInput(e.target.value)}
                        placeholder="粘贴图片 URL（支持 https://...）"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-fg/60">
                          提示：先随便填一个可访问的图片链接试试。
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setBackgroundCustomUrl(bgUrlInput.trim())
                            toast('背景已更新')
                          }}
                        >
                          应用
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Section>

                <Section title="侧边栏">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={sidebarAutoHide}
                      onClick={() => setSidebarAutoHide(!sidebarAutoHide)}
                    >
                      {sidebarAutoHide ? '自动隐藏：开' : '自动隐藏：关'}
                    </SegButton>
                  </div>
                  {sidebarAutoHide ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-fg/60">
                          隐藏延迟：<span className="font-medium text-fg/80">{sidebarAutoHideDelay}秒</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSidebarAutoHideDelay(3)}
                          className="h-8 px-2"
                        >
                          恢复默认
                        </Button>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={sidebarAutoHideDelay}
                        onChange={(e) => setSidebarAutoHideDelay(Number(e.target.value))}
                        className="w-full accent-[rgb(var(--primary))]"
                      />
                      <div className="text-xs text-fg/60">
                        提示：开启后，侧边栏会在指定时间后自动隐藏，鼠标悬浮时重新显示。
                      </div>
                    </div>
                  ) : null}
                </Section>
              </>
            ) : null}

            {tab === 'clock' ? (
              <>
                <Section title="小时制">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={clockHourCycle === '24'}
                      onClick={() => onChangeHourCycle('24')}
                    >
                      24 小时
                    </SegButton>
                    <SegButton
                      active={clockHourCycle === '12'}
                      onClick={() => onChangeHourCycle('12')}
                    >
                      12 小时
                    </SegButton>
                  </div>
                </Section>

                <Section title="显示内容">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={clockShowSeconds}
                      onClick={() => setClockShowSeconds(!clockShowSeconds)}
                    >
                      {clockShowSeconds ? '显示秒：开' : '显示秒：关'}
                    </SegButton>
                    <SegButton
                      active={clockShowDate}
                      onClick={() => setClockShowDate(!clockShowDate)}
                    >
                      {clockShowDate ? '显示日期：开' : '显示日期：关'}
                    </SegButton>
                  </div>
                </Section>

                <Section title="字体颜色">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={clockFollowAccent}
                      onClick={() => setClockFollowAccent(!clockFollowAccent)}
                    >
                      {clockFollowAccent ? '跟随主题色：开' : '跟随主题色：关'}
                    </SegButton>
                  </div>
                  <div className="text-xs text-fg/60">
                    提示：开启后，时钟会使用主题色（primary）。
                  </div>
                </Section>
              </>
            ) : null}

            {tab === 'desktop' ? (
              <>
                <Section title="书签排序（书签页）">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={bookmarkDrawerSortMode === 'custom'}
                      onClick={() => setBookmarkDrawerSortMode('custom')}
                    >
                      自定义
                    </SegButton>
                    <SegButton
                      active={bookmarkDrawerSortMode === 'folders-first'}
                      onClick={() => setBookmarkDrawerSortMode('folders-first')}
                    >
                      文件夹优先
                    </SegButton>
                    <SegButton
                      active={bookmarkDrawerSortMode === 'links-first'}
                      onClick={() => setBookmarkDrawerSortMode('links-first')}
                    >
                      链接优先
                    </SegButton>
                    <SegButton
                      active={bookmarkDrawerSortMode === 'alphabetical'}
                      onClick={() => setBookmarkDrawerSortMode('alphabetical')}
                    >
                      字母排序
                    </SegButton>
                  </div>
                  <div className="text-xs text-fg/60 leading-relaxed">
                    提示：自定义模式保留你的手动排序；其他模式会自动排序。字母排序支持中文拼音。
                  </div>
                </Section>

                <Section title="排序锁定">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={bookmarkSortLocked}
                      onClick={() => setBookmarkSortLocked(!bookmarkSortLocked)}
                    >
                      {bookmarkSortLocked ? '锁定排序：开' : '锁定排序：关'}
                    </SegButton>
                  </div>
                  <div className="text-xs text-fg/60 leading-relaxed">
                    提示：开启后，书签页将禁止拖拽排序和创建文件夹，防止误操作。
                  </div>
                </Section>

                <Section title="书签拖拽（手机桌面风格）">
                  <div className="flex flex-wrap gap-2">
                    <SegButton active={dndPrePush} onClick={() => setDndPrePush(!dndPrePush)}>
                      {dndPrePush ? '预挤压：开' : '预挤压：关'}
                    </SegButton>
                    <SegButton
                      active={dndPushAnim}
                      onClick={() => setDndPushAnim(!dndPushAnim)}
                    >
                      {dndPushAnim ? '挤压动画：开' : '挤压动画：关'}
                    </SegButton>
                    <SegButton
                      active={dndDropAnim}
                      onClick={() => setDndDropAnim(!dndDropAnim)}
                    >
                      {dndDropAnim ? '归位动画：开' : '归位动画：关'}
                    </SegButton>
                  </div>
                  <div className="text-xs text-fg/60 leading-relaxed">
                    提示：开启“预挤压”后，拖拽时其它图标会实时被挤开；“挤压动画”会让这个过程更顺滑；
                    “归位动画”会让松手后落位更自然。
                  </div>
                </Section>
              </>
            ) : null}

            {tab === 'search' ? (
              <>
                <Section title="搜索引擎">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={searchEngine === 'baidu'}
                      onClick={() => onChangeSearchEngine('baidu')}
                    >
                      百度
                    </SegButton>
                    <SegButton
                      active={searchEngine === 'bing'}
                      onClick={() => onChangeSearchEngine('bing')}
                    >
                      必应
                    </SegButton>
                    <SegButton
                      active={searchEngine === 'google'}
                      onClick={() => onChangeSearchEngine('google')}
                    >
                      谷歌
                    </SegButton>
                    <SegButton
                      active={searchEngine === 'custom'}
                      onClick={() => onChangeSearchEngine('custom')}
                    >
                      自定义
                    </SegButton>
                  </div>
                  <div className="text-xs text-fg/60">
                    提示：选择你偏好的搜索引擎，搜索建议也会从对应引擎获取。
                  </div>
                </Section>

                <Section title="流光边框">
                  <div className="flex flex-wrap gap-2">
                    <SegButton
                      active={searchGlowBorder}
                      onClick={() => setSearchGlowBorder(!searchGlowBorder)}
                    >
                      {searchGlowBorder ? '流光线条：开' : '流光线条：关'}
                    </SegButton>
                    <SegButton
                      active={searchGlowLight}
                      onClick={() => setSearchGlowLight(!searchGlowLight)}
                    >
                      {searchGlowLight ? '背后光效：开' : '背后光效：关'}
                    </SegButton>
                    {searchGlowLight && (
                      <SegButton
                        active={searchGlowLightMove}
                        onClick={() => setSearchGlowLightMove(!searchGlowLightMove)}
                      >
                        {searchGlowLightMove ? '光效移动：开' : '光效移动：关'}
                      </SegButton>
                    )}
                  </div>
                  <div className="text-xs text-fg/60">
                    提示：流光线条在边框上移动；背后光效像灯泡照亮外围；光效移动控制是否跟随线条。
                  </div>
                </Section>

                {searchEngine === 'custom' ? (
                  <Section title="自定义搜索引擎 URL">
                    <div className="space-y-2">
                      <Input
                        value={customSearchUrlInput}
                        onChange={(e) => setCustomSearchUrlInput(e.target.value)}
                        placeholder="https://example.com/search?q={query}"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={cn(
                            'text-xs',
                            customSearchUrlInput.trim() && !isValidCustomSearchUrl(customSearchUrlInput)
                              ? 'text-red-200'
                              : 'text-fg/60',
                          )}
                        >
                          {!customSearchUrlInput.trim()
                            ? '使用 {query} 作为搜索词占位符'
                            : isValidCustomSearchUrl(customSearchUrlInput)
                              ? '格式正确'
                              : '格式不对，需要包含 {query} 且是有效 URL'}
                        </div>
                        <Button
                          size="sm"
                          disabled={!isValidCustomSearchUrl(customSearchUrlInput)}
                          onClick={() => {
                            setCustomSearchUrl(customSearchUrlInput.trim())
                            toast('自定义搜索引擎已保存')
                          }}
                        >
                          应用
                        </Button>
                      </div>
                    </div>
                  </Section>
                ) : null}

                <Section title="搜索历史">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-fg/60">
                        显示条数：
                        <span className="font-medium text-fg/80">
                          {searchHistoryCount === 0 ? '关闭' : `${searchHistoryCount} 条`}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSearchHistoryCount(10)}
                        className="h-8 px-2"
                      >
                        恢复默认
                      </Button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={searchHistoryCount}
                      onChange={(e) => setSearchHistoryCount(Number(e.target.value))}
                      className="w-full accent-[rgb(var(--primary))]"
                    />
                    <div className="text-xs text-fg/60">
                      提示：设为 0 可关闭搜索历史显示。历史记录按用户保存，不同账号互不影响。
                    </div>
                  </div>
                </Section>

                <Section title="选项行高">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-fg/60">
                        当前高度：
                        <span className="font-medium text-fg/80">{searchRowHeight}px</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSearchRowHeight(40)}
                        className="h-8 px-2"
                      >
                        恢复默认
                      </Button>
                    </div>
                    <input
                      type="range"
                      min={32}
                      max={56}
                      step={2}
                      value={searchRowHeight}
                      onChange={(e) => setSearchRowHeight(Number(e.target.value))}
                      className="w-full accent-[rgb(var(--primary))]"
                    />
                    <div className="text-xs text-fg/60">
                      提示：调整搜索建议和历史记录每行的高度，范围 32-56px。
                    </div>
                  </div>
                </Section>
              </>
            ) : null}

            {tab === 'account' ? (
              <>
                <Section title="登录状态">
                  {user ? (
                    <div className="text-sm text-fg/80">
                      当前用户：<span className="font-medium">{user.username}</span>（昵称：
                      <span className="font-medium">{user.nickname}</span>）
                    </div>
                  ) : (
                    <div className="text-sm text-fg/70">当前未登录</div>
                  )}
                </Section>

                {user && (
                  <>
                    <Section title="个人资料">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">账号名称</div>
                          <Input
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            placeholder="3-32个字符"
                            className={cn(!usernameValid && usernameInput && 'border-red-500/50')}
                          />
                          {!usernameValid && usernameInput && (
                            <p className="text-xs text-red-400">账号名称需要3-32个字符</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">昵称（唯一）</div>
                          <Input
                            value={nicknameInput}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            placeholder="2-32个字符"
                            className={cn(!nicknameValid && nicknameInput && 'border-red-500/50')}
                          />
                          {!nicknameValid && nicknameInput && (
                            <p className="text-xs text-red-400">昵称需要2-32个字符</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">邮箱（可选）</div>
                          <Input
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="example@email.com"
                            className={cn(!emailValid && emailInput && 'border-red-500/50')}
                          />
                          {!emailValid && emailInput && (
                            <p className="text-xs text-red-400">请输入有效的邮箱地址</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">手机号（可选）</div>
                          <Input
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="6-32个字符"
                            className={cn(!phoneValid && phoneInput && 'border-red-500/50')}
                          />
                          {!phoneValid && phoneInput && (
                            <p className="text-xs text-red-400">手机号需要6-32个字符</p>
                          )}
                        </div>

                        <Button
                          variant="primary"
                          onClick={handleSaveProfile}
                          disabled={!profileValid || profileLoading}
                          className="w-full"
                        >
                          {profileLoading ? '保存中...' : '保存资料'}
                        </Button>
                      </div>
                    </Section>

                    <Section title="修改密码">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">当前密码</div>
                          <div className="relative">
                            <Input
                              type={showCurrentPwd ? 'text' : 'password'}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="请输入当前密码"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/40 hover:text-fg/60 transition-colors"
                              onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                            >
                              {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">新密码</div>
                          <div className="relative">
                            <Input
                              type={showNewPwd ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="6-200个字符"
                              className={cn(!newPasswordValid && newPassword && 'border-red-500/50')}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/40 hover:text-fg/60 transition-colors"
                              onClick={() => setShowNewPwd(!showNewPwd)}
                            >
                              {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {!newPasswordValid && newPassword && (
                            <p className="text-xs text-red-400">密码需要6-200个字符</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-fg/60">确认新密码</div>
                          <div className="relative">
                            <Input
                              type={showConfirmPwd ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="再次输入新密码"
                              className={cn(!confirmPasswordValid && confirmPassword && 'border-red-500/50')}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/40 hover:text-fg/60 transition-colors"
                              onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                            >
                              {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {!confirmPasswordValid && confirmPassword && (
                            <p className="text-xs text-red-400">两次输入的密码不一致</p>
                          )}
                        </div>

                        <Button
                          variant="primary"
                          onClick={handleChangePassword}
                          disabled={!passwordFormValid || passwordLoading}
                          className="w-full"
                        >
                          {passwordLoading ? '修改中...' : '修改密码'}
                        </Button>
                      </div>
                    </Section>
                  </>
                )}

                <Section title="退出登录">
                  <Button
                    variant="glass"
                    disabled={!user}
                    onClick={() => {
                      logout()
                      toast('已退出登录')
                    }}
                  >
                    退出当前账号
                  </Button>
                </Section>

                <Section title="设置导入 / 导出（不写入数据库）">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={exportSettings}>
                      导出设置
                    </Button>
                    <label className="inline-flex items-center">
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0]
                          e.currentTarget.value = ''
                          if (f) void importSettings(f)
                        }}
                      />
                      <Button variant="glass" type="button">
                        导入设置
                      </Button>
                    </label>
                  </div>
                  <div className="text-xs text-fg/60 leading-relaxed">
                    提示：导出的文件可带到新设备导入，以保持你的外观/时钟等使用习惯。
                  </div>
                </Section>

                <Section title="关于">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="glass" onClick={() => setChangelogOpen(true)}>
                      <History className="w-4 h-4 mr-2" />
                      版本更新日志
                    </Button>
                  </div>
                  <div className="text-xs text-fg/60 leading-relaxed">
                    当前版本：v{__APP_VERSION__}
                  </div>
                </Section>
              </>
            ) : null}
          </div>
        </div>

        {/* Footer 固定 */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              先这样
            </Button>
            <Button variant="primary" onClick={closeAndToast}>
              保存并关闭
            </Button>
          </div>
        </div>
      </div>

      {/* 版本更新日志模态框 */}
      <ChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  )
}


