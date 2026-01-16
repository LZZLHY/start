import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'

interface TooltipProps {
  /** 提示内容 */
  content: ReactNode
  /** 子元素 */
  children: ReactNode
  /** 延迟显示时间（毫秒） */
  delay?: number
  /** 位置 */
  position?: 'top' | 'bottom'
  /** 是否禁用 */
  disabled?: boolean
}

export function Tooltip({
  content,
  children,
  delay = 500,
  position = 'top',
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)

  const showTooltip = () => {
    if (disabled || !content) return
    
    timerRef.current = window.setTimeout(() => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const gap = 8
      
      setCoords({
        x: rect.left + rect.width / 2,
        y: position === 'top' ? rect.top - gap : rect.bottom + gap,
      })
      setVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <>
      <div
        ref={wrapperRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="inline-block"
      >
        {children}
      </div>
      {visible && content && createPortal(
        <div
          className={cn(
            'fixed z-[9999] px-3 py-2 rounded-xl pointer-events-none',
            'bg-bg/95 backdrop-blur-md border border-glass-border/30',
            'text-sm text-fg shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150',
            'max-w-[280px]',
            position === 'top' ? '-translate-x-1/2 -translate-y-full' : '-translate-x-1/2',
          )}
          style={{ left: coords.x, top: coords.y }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
