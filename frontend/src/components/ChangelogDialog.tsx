/**
 * 版本更新日志模态框
 */

import { useEffect, useState } from 'react'
import { X, Calendar, Tag } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button } from './ui/Button'

type Props = {
  open: boolean
  onClose: () => void
}

interface VersionEntry {
  version: string
  patch?: number
  date: string
  changes: string[]
}

interface ChangelogData {
  versions: VersionEntry[]
}

export function ChangelogDialog({ open, onClose }: Props) {
  const [changelog, setChangelog] = useState<ChangelogData | null>(null)
  const [loading, setLoading] = useState(false)

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
    setLoading(true)
    fetch('/changelog.json')
      .then((res) => res.json())
      .then((data: ChangelogData) => {
        setChangelog(data)
      })
      .catch(() => {
        setChangelog(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full max-w-sm rounded-[var(--start-radius)] p-5',
          'max-h-[70vh] flex flex-col',
          'glass-modal shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-semibold text-lg">版本更新日志</h3>
            <p className="text-xs text-fg/60 mt-0.5">查看历史版本更新内容</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="关闭"
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content - Scrollable */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {loading ? (
            <div className="text-center text-fg/60 py-8">加载中...</div>
          ) : !changelog || changelog.versions.length === 0 ? (
            <div className="text-center text-fg/60 py-8">暂无更新日志</div>
          ) : (
            changelog.versions.map((entry, idx) => (
              <div
                key={entry.version}
                className={cn(
                  'p-4 rounded-xl border',
                  'bg-glass/5 border-glass-border/20',
                  idx === 0 && 'border-primary/30 bg-primary/5',
                )}
              >
                {/* Version Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" />
                    <span className={cn(
                      'font-semibold',
                      idx === 0 ? 'text-primary' : 'text-fg/90',
                    )}>
                      v{entry.version}{entry.patch ? ` (#${entry.patch})` : ''}
                    </span>
                    {idx === 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                        最新
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-fg/50">
                    <Calendar className="w-3 h-3" />
                    {entry.date}
                  </div>
                </div>

                {/* Changes List */}
                <ul className="space-y-1.5">
                  {entry.changes.map((change, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-2 text-sm text-fg/80"
                    >
                      <span className="text-primary shrink-0">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-glass-border/20 shrink-0">
          <Button variant="glass" onClick={onClose} className="w-full">
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}
