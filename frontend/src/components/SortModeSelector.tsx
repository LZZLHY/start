import { useState, useRef, useEffect } from 'react'
import { ArrowDownAZ, FolderUp, FolderDown, GripVertical, ChevronDown, Lock } from 'lucide-react'
import { cn } from '../utils/cn'
import type { SortMode } from '../types/bookmark'

const SORT_MODE_OPTIONS: { value: SortMode; label: string; icon: React.ReactNode }[] = [
  { value: 'custom', label: '自定义', icon: <GripVertical className="w-4 h-4" /> },
  { value: 'folders-first', label: '文件夹在前', icon: <FolderUp className="w-4 h-4" /> },
  { value: 'links-first', label: '链接在前', icon: <FolderDown className="w-4 h-4" /> },
  { value: 'alphabetical', label: '按名称 A-Z', icon: <ArrowDownAZ className="w-4 h-4" /> },
]

type SortModeSelectorProps = {
  value: SortMode
  onChange: (mode: SortMode) => void
  disabled?: boolean
  locked?: boolean
  className?: string
}

export function SortModeSelector({ value, onChange, disabled, locked, className }: SortModeSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentOption = SORT_MODE_OPTIONS.find(opt => opt.value === value) ?? SORT_MODE_OPTIONS[0]

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm',
          'bg-glass/20 hover:bg-glass/30 transition-colors',
          'border border-glass-border/20',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {currentOption.icon}
        <span className="text-fg/80">{currentOption.label}</span>
        {locked && <Lock className="w-3 h-3 text-fg/50 ml-0.5" />}
        <ChevronDown className={cn('w-3.5 h-3.5 text-fg/50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div 
          className={cn(
            'absolute top-full left-0 mt-2 z-50 w-full min-w-[160px]',
            'rounded-2xl border border-glass-border/20 backdrop-blur-xl shadow-glass',
            'bg-glass/75 overflow-hidden',
            'animate-in fade-in-0 slide-in-from-top-2 duration-200',
          )}
        >
          <div className="py-2 px-2 space-y-1">
            {SORT_MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                  'rounded-xl border transition-all duration-150',
                  opt.value === value
                    ? 'bg-primary/20 border-primary/30 text-primary'
                    : 'border-transparent text-fg/80 hover:bg-primary/10 hover:border-primary/20 hover:text-fg',
                )}
              >
                <span className={cn(
                  'transition-colors',
                  opt.value === value ? 'text-primary' : 'text-fg/40',
                )}>
                  {opt.icon}
                </span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export { SORT_MODE_OPTIONS }
