/**
 * 日志查看 Tab 组件
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw,
  Search,
  Download,
  Play,
  Square,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Skull,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  Activity,
  AlertOctagon,
  ClipboardList,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { apiFetch, apiBase } from '../../services/api'
import { cn } from '../../utils/cn'

interface LogEntry {
  timestamp: string
  level?: number
  levelName?: string
  message?: string
  source?: string
  requestId?: string
  userId?: string
  method?: string
  url?: string
  statusCode?: number
  responseTime?: string
  category?: string
  stack?: string
  action?: string
  resource?: string
  success?: boolean
  ip?: string
  [key: string]: unknown
}

interface LogsTabProps {
  token: string
}

const LOG_TYPES = [
  { value: 'app', label: '应用日志', icon: <FileText className="w-4 h-4" /> },
  { value: 'request', label: '请求日志', icon: <Activity className="w-4 h-4" /> },
  { value: 'error', label: '错误日志', icon: <AlertOctagon className="w-4 h-4" /> },
  { value: 'audit', label: '审计日志', icon: <ClipboardList className="w-4 h-4" /> },
]

const LOG_LEVELS = [
  { value: '', label: '全部级别', icon: <Filter className="w-4 h-4" />, color: '', tooltip: '显示所有级别的日志' },
  { value: 'debug', label: 'DEBUG', icon: <Bug className="w-4 h-4 text-gray-500" />, color: 'text-gray-500', tooltip: '调试信息' },
  { value: 'info', label: 'INFO', icon: <Info className="w-4 h-4 text-blue-500" />, color: 'text-blue-500', tooltip: '一般信息' },
  { value: 'warn', label: 'WARN', icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, color: 'text-amber-500', tooltip: '警告信息' },
  { value: 'error', label: 'ERROR', icon: <AlertCircle className="w-4 h-4 text-red-500" />, color: 'text-red-500', tooltip: '错误信息' },
  { value: 'fatal', label: 'FATAL', icon: <Skull className="w-4 h-4 text-red-600" />, color: 'text-red-600 font-bold', tooltip: '致命错误' },
]

function getLevelIcon(level?: number | string) {
  const l = typeof level === 'string' ? level.toLowerCase() : level
  if (l === 0 || l === 'debug') return <Bug className="w-4 h-4 text-gray-400" />
  if (l === 1 || l === 'info') return <Info className="w-4 h-4 text-blue-400" />
  if (l === 2 || l === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400" />
  if (l === 3 || l === 'error') return <AlertCircle className="w-4 h-4 text-red-400" />
  if (l === 4 || l === 'fatal') return <Skull className="w-4 h-4 text-red-600" />
  return <Info className="w-4 h-4 text-gray-400" />
}

function getLevelBg(level?: number | string) {
  const l = typeof level === 'string' ? level.toLowerCase() : level
  if (l === 2 || l === 'warn') return 'bg-amber-500/5 border-amber-500/20'
  if (l === 3 || l === 'error') return 'bg-red-500/5 border-red-500/20'
  if (l === 4 || l === 'fatal') return 'bg-red-500/10 border-red-500/30'
  return 'bg-glass/5 border-glass-border/10'
}

/** 获取日志级别的样式类 */
function getLevelStyle(levelName?: string) {
  const l = levelName?.toUpperCase()
  switch (l) {
    case 'DEBUG':
      return 'bg-gray-500/10 text-gray-500'
    case 'INFO':
      return 'bg-blue-500/10 text-blue-500'
    case 'WARN':
      return 'bg-amber-500/10 text-amber-500'
    case 'ERROR':
      return 'bg-red-500/10 text-red-500'
    case 'FATAL':
      return 'bg-red-600/20 text-red-600 font-bold'
    default:
      return 'bg-glass/10 text-fg/60'
  }
}

export function LogsTab({ token }: LogsTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState('app')
  const [level, setLevel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const limit = 50

  const loadLogs = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type,
        limit: String(limit),
        offset: String((p - 1) * limit),
      })
      if (level) params.set('level', level)
      if (keyword) params.set('keyword', keyword)

      const resp = await apiFetch<{ items: LogEntry[]; total: number; hasMore: boolean }>(
        `/api/admin/logs?${params.toString()}`,
        { method: 'GET', token }
      )
      if (!resp.ok) return toast.error(resp.message)
      setLogs(resp.data.items)
      setTotal(resp.data.total)
      setHasMore(resp.data.hasMore)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [token, type, level, keyword, page])

  const exportLogs = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    
    const resp = await apiFetch<unknown>('/api/admin/logs/export', {
      method: 'POST',
      token,
      body: JSON.stringify({
        type,
        startDate: weekAgo,
        endDate: today,
        format: 'json',
      }),
    })
    
    if (!resp.ok) return toast.error(resp.message)
    
    // 下载文件
    const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-logs-${today}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('日志已导出')
  }

  const startStreaming = () => {
    if (eventSourceRef.current) return
    
    const apiBaseUrl = apiBase()
    // EventSource 不支持自定义 headers，通过 URL 参数传递 token
    const url = `${apiBaseUrl}/api/admin/logs/stream?type=${type}&token=${encodeURIComponent(token)}`
    
    const es = new EventSource(url)
    eventSourceRef.current = es
    setStreaming(true)
    
    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data)
        if (entry.type === 'connected') return
        setLogs(prev => [entry, ...prev].slice(0, 200))
      } catch {
        // 忽略解析错误
      }
    }
    
    es.onerror = () => {
      stopStreaming()
      toast.error('实时日志连接断开')
    }
  }

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStreaming(false)
  }

  useEffect(() => {
    loadLogs(1)
    return () => stopStreaming()
  }, [type])

  // 级别变化时自动搜索
  useEffect(() => {
    loadLogs(1)
  }, [level])

  useEffect(() => {
    return () => stopStreaming()
  }, [])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-fg tracking-tight">日志查看</h2>
          <p className="mt-1 text-sm text-fg/60">查看系统日志、请求日志、错误日志和审计日志。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="sm"
            onClick={streaming ? stopStreaming : startStreaming}
            className={streaming ? 'text-red-500' : ''}
          >
            {streaming ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {streaming ? '停止' : '实时'}
          </Button>
          <Button variant="glass" size="sm" onClick={exportLogs}>
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button variant="glass" size="sm" onClick={() => loadLogs(1)} disabled={loading || streaming}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center gap-3 relative z-10 mt-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-fg/40" />
          <Select
            value={type}
            onChange={setType}
            options={LOG_TYPES}
            width="130px"
          />
        </div>

        <Select
          value={level}
          onChange={setLevel}
          options={LOG_LEVELS}
          width="130px"
        />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-glass/10 border border-glass-border/20 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="搜索关键词..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadLogs(1)
            }}
          />
        </div>

        <Button variant="primary" size="sm" onClick={() => loadLogs(1)}>
          搜索
        </Button>
      </div>

      {/* Log List */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col mt-6 flex-1 min-h-0">
        <div className="divide-y divide-glass-border/10 overflow-y-auto flex-1">
          {logs.length === 0 && !loading && (
            <div className="p-8 text-center text-fg/50 text-sm">暂无日志数据</div>
          )}
          {logs.map((log, idx) => {
            const key = `${log.timestamp}-${idx}`
            const isExpanded = expanded === key
            
            return (
              <div
                key={key}
                className={cn(
                  'p-4 cursor-pointer transition-colors hover:bg-glass/5 border-l-2',
                  getLevelBg(log.level || log.levelName)
                )}
                onClick={() => setExpanded(isExpanded ? null : key)}
              >
                <div className="flex items-start gap-3">
                  {getLevelIcon(log.level || log.levelName)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-fg/50 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      {log.source && (
                        <span className="text-xs px-2 py-0.5 rounded bg-glass/10 text-fg/60">
                          {log.source}
                        </span>
                      )}
                      {log.levelName && (
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded font-medium',
                          getLevelStyle(log.levelName)
                        )}>
                          {log.levelName}
                        </span>
                      )}
                      {log.requestId && (
                        <span className="text-xs text-fg/40 font-mono">
                          {log.requestId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-fg break-all">
                      {log.message || (log.action ? `${log.action} ${log.resource}` : JSON.stringify(log).slice(0, 100))}
                    </div>
                    {/* Request/Response specific */}
                    {(log.method || log.statusCode) && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-fg/50">
                        {log.method && <span className="font-medium">{log.method}</span>}
                        {log.url && <span className="truncate max-w-[300px]">{log.url}</span>}
                        {log.statusCode && (
                          <span className={cn(
                            'px-1.5 py-0.5 rounded',
                            log.statusCode >= 500 ? 'bg-red-500/10 text-red-500' :
                            log.statusCode >= 400 ? 'bg-amber-500/10 text-amber-500' :
                            'bg-green-500/10 text-green-500'
                          )}>
                            {log.statusCode}
                          </span>
                        )}
                        {log.responseTime && <span>{log.responseTime}</span>}
                      </div>
                    )}
                    {/* Audit specific */}
                    {log.action && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-fg/50">
                        <span className={log.success ? 'text-green-500' : 'text-red-500'}>
                          {log.success ? '✓' : '✗'}
                        </span>
                        {log.userId && <span>用户: {log.userId.slice(0, 8)}</span>}
                        {log.ip && <span>IP: {log.ip}</span>}
                      </div>
                    )}
                    {/* Expanded details */}
                    {isExpanded && (
                      <pre className="mt-3 p-3 bg-glass/10 rounded-lg text-xs text-fg/70 overflow-x-auto">
                        {JSON.stringify(log, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {!streaming && totalPages > 1 && (
          <div className="border-t border-glass-border/10 p-4 flex items-center justify-between flex-shrink-0">
            <div className="text-xs text-fg/50">
              共 {total} 条，第 {page}/{totalPages} 页
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => loadLogs(page - 1)}
              >
                <ChevronLeft className="w-4 h-4" /> 上一页
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!hasMore}
                onClick={() => loadLogs(page + 1)}
              >
                下一页 <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
