import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  icon?: React.ReactNode
  color?: string
  tooltip?: string
}

interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  className?: string
  /** 固定宽度，不设置则自动计算 */
  width?: string
  /** 最小宽度 */
  minWidth?: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  width,
  minWidth = '120px',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [hoveredOption, setHoveredOption] = useState<T | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Map<T, HTMLButtonElement>>(new Map())
  const currentOption = options.find(opt => opt.value === value) ?? options[0]

  // 计算最长选项的宽度
  const calculatedWidth = useMemo(() => {
    if (width) return width
    const maxLabelLength = Math.max(...options.map(opt => opt.label.length))
    const hasIcon = options.some(opt => opt.icon)
    const iconWidth = hasIcon ? 24 : 0
    const charWidth = 14
    const padding = 64
    const estimated = maxLabelLength * charWidth + iconWidth + padding
    return `${Math.max(estimated, parseInt(minWidth))}px`
  }, [options, width, minWidth])

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

  // 更新 tooltip 位置
  useEffect(() => {
    if (!hoveredOption || !open) {
      setTooltipPosition(null)
      return
    }
    const optionEl = optionRefs.current.get(hoveredOption)
    const containerEl = containerRef.current
    if (optionEl && containerEl) {
      const optionRect = optionEl.getBoundingClientRect()
      const containerRect = containerEl.getBoundingClientRect()
      setTooltipPosition({
        top: optionRect.top - containerRect.top + optionRect.height / 2,
      })
    }
  }, [hoveredOption, open])

  // 获取悬浮选项的 tooltip 内容
  const hoveredTooltip = useMemo(() => {
    if (!hoveredOption) return null
    const opt = options.find(o => o.value === hoveredOption)
    return opt?.tooltip || null
  }, [hoveredOption, options])

  return (
    <div ref={containerRef} className={cn('relative z-20', className)} style={{ width: calculatedWidth }}>
      {/* 触发按钮 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'group flex items-center gap-2 h-9 px-3 rounded-xl text-sm w-full',
          'bg-glass/10 transition-all duration-300 ease-out',
          'border border-glass-border/20',
          'focus:outline-none',
          'hover:bg-glass/20 hover:border-glass-border/40 hover:shadow-lg hover:shadow-black/5',
          open && 'bg-glass/20 border-primary/30 shadow-lg shadow-primary/5 ring-2 ring-primary/10',
        )}
      >
        {currentOption.icon && (
          <span className="flex-shrink-0 text-fg/60 group-hover:text-fg/80 transition-colors duration-200">
            {currentOption.icon}
          </span>
        )}
        <span className={cn(
          'flex-1 text-left truncate transition-colors duration-200',
          currentOption.color || 'text-fg/80 group-hover:text-fg'
        )}>
          {currentOption.label}
        </span>
        <ChevronDown 
          className={cn(
            'w-4 h-4 text-fg/40 group-hover:text-fg/60 transition-all duration-300 flex-shrink-0',
            open && 'rotate-180 text-primary/60'
          )} 
        />
      </button>

      {/* 下拉菜单 */}
      <div 
        className={cn(
          'absolute top-full left-0 mt-2 z-[100] py-2 rounded-2xl',
          'bg-bg backdrop-blur-xl',
          'border border-primary/20',
          'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]',
          'dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]',
          'transition-all duration-300 ease-out origin-top',
          open 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        )}
        style={{ width: calculatedWidth }}
      >
        {/* 顶部装饰线 */}
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        
        {options.map((opt, index) => {
          const isSelected = opt.value === value
          const isHovered = hoveredOption === opt.value
          
          return (
            <button
              key={opt.value}
              ref={(el) => {
                if (el) optionRefs.current.set(opt.value, el)
              }}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              onMouseEnter={() => setHoveredOption(opt.value)}
              onMouseLeave={() => setHoveredOption(null)}
              className={cn(
                'group/item w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl text-sm text-left',
                'transition-all duration-200 ease-out',
                'relative overflow-hidden',
                isHovered && !isSelected && 'bg-glass/40',
                isSelected && 'bg-primary/10',
              )}
              style={{
                width: 'calc(100% - 8px)',
                animationDelay: `${index * 30}ms`,
              }}
            >
              {/* 悬浮背景光效 */}
              <div className={cn(
                'absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5',
                'opacity-0 transition-opacity duration-300',
                isHovered && 'opacity-100'
              )} />
              
              {/* 左侧高亮条 */}
              <div className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full',
                'bg-gradient-to-b from-primary/80 to-primary/40',
                'transition-all duration-300 ease-out',
                isHovered && 'h-4',
                isSelected && 'h-5 bg-primary'
              )} />

              {/* 图标 */}
              {opt.icon && (
                <span className={cn(
                  'relative flex-shrink-0 transition-all duration-200',
                  'text-fg/50 group-hover/item:text-fg/80',
                  isSelected && 'text-primary',
                  isHovered && 'scale-110 text-primary/80'
                )}>
                  {opt.icon}
                </span>
              )}
              
              {/* 文字 */}
              <span className={cn(
                'relative flex-1 truncate transition-all duration-200',
                opt.color || 'text-fg/70 group-hover/item:text-fg',
                isSelected && 'text-primary font-medium'
              )}>
                {opt.label}
              </span>
              
              {/* 选中标记 */}
              <span className={cn(
                'relative flex-shrink-0 transition-all duration-300',
                isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
              )}>
                <Check className="w-4 h-4 text-primary" />
              </span>
            </button>
          )
        })}
        
        {/* 底部装饰线 */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-glass-border/30 to-transparent" />
      </div>

      {/* Tooltip */}
      {hoveredTooltip && open && tooltipPosition && (
        <div
          className={cn(
            'absolute z-[110] px-3 py-2 rounded-xl text-xs',
            'bg-bg text-fg border border-glass-border/30',
            'shadow-[0_4px_16px_rgba(0,0,0,0.1)]',
            'dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]',
            'transition-all duration-200 ease-out',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-left-2',
            'max-w-[220px] leading-relaxed'
          )}
          style={{
            left: `calc(100% + 12px)`,
            top: tooltipPosition.top,
            transform: 'translateY(-50%)',
          }}
        >
          {/* 小三角 */}
          <div 
            className="absolute w-2.5 h-2.5 bg-bg border-l border-b border-glass-border/30 rotate-45 rounded-sm"
            style={{
              left: '-6px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <span className="relative z-10 font-medium">{hoveredTooltip}</span>
        </div>
      )}
    </div>
  )
}
