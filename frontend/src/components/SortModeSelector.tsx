import { ArrowDownAZ, FolderUp, FolderDown, GripVertical, MousePointerClick, Lock } from 'lucide-react'
import { Select, type SelectOption } from './ui/Select'
import { cn } from '../utils/cn'
import type { SortMode } from '../types/bookmark'

const SORT_MODE_OPTIONS: SelectOption<SortMode>[] = [
  { value: 'custom', label: '自定义', icon: <GripVertical className="w-4 h-4" />, tooltip: '手动拖拽排序书签' },
  { value: 'folders-first', label: '文件夹在前', icon: <FolderUp className="w-4 h-4" />, tooltip: '文件夹显示在链接前面' },
  { value: 'links-first', label: '链接在前', icon: <FolderDown className="w-4 h-4" />, tooltip: '链接显示在文件夹前面' },
  { value: 'alphabetical', label: '按名称 A-Z', icon: <ArrowDownAZ className="w-4 h-4" />, tooltip: '按字母顺序排列' },
  { value: 'click-count', label: '按点击次数', icon: <MousePointerClick className="w-4 h-4" />, tooltip: '点击最多的排在前面' },
]

type SortModeSelectorProps = {
  value: SortMode
  onChange: (mode: SortMode) => void
  disabled?: boolean
  locked?: boolean
  className?: string
}

export function SortModeSelector({ value, onChange, disabled, locked, className }: SortModeSelectorProps) {
  if (disabled) {
    const currentOption = SORT_MODE_OPTIONS.find(opt => opt.value === value) ?? SORT_MODE_OPTIONS[0]
    return (
      <div className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm',
        'bg-glass/20 border border-glass-border/20',
        'opacity-50 cursor-not-allowed',
        className
      )}>
        {currentOption.icon}
        <span className="text-fg/80">{currentOption.label}</span>
        {locked && <Lock className="w-3 h-3 text-fg/50 ml-0.5" />}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <Select
        value={value}
        onChange={onChange}
        options={SORT_MODE_OPTIONS}
      />
      {locked && (
        <Lock className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-fg/50 pointer-events-none" />
      )}
    </div>
  )
}

export { SORT_MODE_OPTIONS }
