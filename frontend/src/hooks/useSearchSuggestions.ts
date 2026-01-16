import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { SearchEngine } from '../stores/appearance'

const DEBOUNCE_DELAY = 300
const MAX_SUGGESTIONS = 8

/** 已显示过的谷歌网络错误提示（避免重复提示） */
let googleNetworkErrorShown = false

/**
 * 通过后端代理获取搜索建议
 */
async function fetchSuggestionsViaProxy(
  query: string,
  engine: Exclude<SearchEngine, 'custom'>,
  token: string | null
): Promise<string[]> {
  if (!token) return []

  const resp = await apiFetch<{ suggestions: string[]; engine: string }>(
    `/api/utils/search-suggestions?query=${encodeURIComponent(query)}&engine=${engine}`,
    { method: 'GET', token }
  )

  if (!resp.ok) {
    // 谷歌网络错误特殊处理
    if (engine === 'google' && resp.message?.includes('无法连接谷歌')) {
      if (!googleNetworkErrorShown) {
        googleNetworkErrorShown = true
        toast.error('无法获取谷歌搜索建议，请检查网络环境', {
          duration: 5000,
          id: 'google-suggestion-error',
        })
        // 30秒后重置，允许再次提示
        setTimeout(() => {
          googleNetworkErrorShown = false
        }, 30000)
      }
    }
    return []
  }

  return resp.data.suggestions.slice(0, MAX_SUGGESTIONS)
}

/**
 * 通过 JSONP 获取百度搜索建议（前端直接请求，无 CORS 问题）
 */
async function fetchBaiduSuggestionsDirect(query: string): Promise<string[]> {
  return new Promise((resolve) => {
    const callbackName = `__baiduSuggestion_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const url = `https://suggestion.baidu.com/su?wd=${encodeURIComponent(query)}&cb=${callbackName}`

    const script = document.createElement('script')
    script.src = url

    const cleanup = () => {
      delete (window as any)[callbackName]
      script.remove()
    }

    const timeout = setTimeout(() => {
      cleanup()
      resolve([])
    }, 5000)

    ;(window as any)[callbackName] = (data: { s?: string[] }) => {
      clearTimeout(timeout)
      cleanup()
      resolve(Array.isArray(data?.s) ? data.s.slice(0, MAX_SUGGESTIONS) : [])
    }

    script.onerror = () => {
      clearTimeout(timeout)
      cleanup()
      resolve([])
    }

    document.head.appendChild(script)
  })
}

/**
 * 获取搜索建议
 */
export async function fetchSuggestions(
  query: string,
  engine: SearchEngine,
  token: string | null
): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // 自定义搜索引擎不支持建议
  if (engine === 'custom') return []

  try {
    // 百度可以直接前端请求（JSONP）
    if (engine === 'baidu') {
      return await fetchBaiduSuggestionsDirect(trimmed)
    }
    
    // 必应和谷歌通过后端代理
    return await fetchSuggestionsViaProxy(trimmed, engine, token)
  } catch (error) {
    console.warn(`Failed to fetch suggestions from ${engine}:`, error)
    return []
  }
}

/**
 * 限制建议数量（纯函数，用于测试）
 */
export function limitSuggestions(suggestions: string[], max: number = MAX_SUGGESTIONS): string[] {
  return suggestions.slice(0, max)
}

export interface UseSearchSuggestionsReturn {
  suggestions: string[]
  isLoading: boolean
  error: Error | null
}

/**
 * 搜索建议 Hook，带防抖处理
 * @param query 搜索查询
 * @param engine 搜索引擎
 * @param enabled 是否启用
 */
export function useSearchSuggestions(
  query: string,
  engine: SearchEngine,
  enabled: boolean = true
): UseSearchSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const token = useAuthStore((s) => s.token)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (q: string, eng: SearchEngine, t: string | null) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchSuggestions(q, eng, t)
      setSuggestions(result)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err)
      }
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // 清理之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    const trimmed = query.trim()

    // 不启用或空查询时清空建议
    if (!enabled || !trimmed) {
      setSuggestions([])
      setIsLoading(false)
      setError(null)
      return
    }

    // 自定义搜索引擎不支持建议
    if (engine === 'custom') {
      setSuggestions([])
      return
    }

    // 防抖处理
    debounceTimerRef.current = setTimeout(() => {
      void fetchData(trimmed, engine, token)
    }, DEBOUNCE_DELAY)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, engine, enabled, token, fetchData])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return { suggestions, isLoading, error }
}

// 导出常量和工具函数用于测试
export const searchSuggestionsUtils = {
  DEBOUNCE_DELAY,
  MAX_SUGGESTIONS,
  fetchSuggestions,
  limitSuggestions,
}
