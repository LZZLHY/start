import type { Response } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../types/auth'
import { fail, ok } from '../utils/http'
import { fetchTitle } from '../services/titleFetcher'
import { isValidUrlForFetch } from '../utils/url'

const FetchTitleSchema = z.object({
  url: z.string().trim().min(1, '网址不能为空'),
})

const SearchSuggestionsSchema = z.object({
  query: z.string().trim().min(1, '搜索词不能为空'),
  engine: z.enum(['baidu', 'bing', 'google']),
})

/** 搜索建议 API URL */
const SUGGESTION_APIS = {
  baidu: 'https://suggestion.baidu.com/su?wd={query}&cb=callback&_={timestamp}',
  bing: 'https://api.bing.com/osjson.aspx?query={query}',
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q={query}',
}

const REQUEST_TIMEOUT = 5000

export async function fetchTitleHandler(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId
  if (!userId) return fail(res, 401, '未登录')

  const parsed = FetchTitleSchema.safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')
  }

  const { url } = parsed.data

  // Validate URL format
  if (!isValidUrlForFetch(url)) {
    return fail(res, 400, '无效的网址格式')
  }

  try {
    const result = await fetchTitle(url)
    return ok(res, result)
  } catch (error) {
    return fail(res, 500, '获取标题失败')
  }
}


/**
 * 搜索建议代理接口
 * 解决前端直接请求搜索引擎 API 的 CORS 问题
 */
export async function searchSuggestionsHandler(req: AuthedRequest, res: Response) {
  const parsed = SearchSuggestionsSchema.safeParse(req.query)
  if (!parsed.success) {
    return fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误')
  }

  const { query, engine } = parsed.data

  try {
    const suggestions = await fetchSearchSuggestions(query, engine)
    return ok(res, { suggestions, engine })
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取搜索建议失败'
    // 对于谷歌，可能是网络问题
    if (engine === 'google') {
      return fail(res, 503, '无法连接谷歌服务，请检查网络环境')
    }
    return fail(res, 500, message)
  }
}

/**
 * 获取搜索建议
 */
async function fetchSearchSuggestions(
  query: string,
  engine: 'baidu' | 'bing' | 'google'
): Promise<string[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    if (engine === 'baidu') {
      return await fetchBaiduSuggestions(query, controller.signal)
    } else {
      return await fetchJsonSuggestions(query, engine, controller.signal)
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 获取百度搜索建议（JSONP 格式需要特殊处理）
 */
async function fetchBaiduSuggestions(query: string, signal: AbortSignal): Promise<string[]> {
  const url = SUGGESTION_APIS.baidu
    .replace('{query}', encodeURIComponent(query))
    .replace('{timestamp}', Date.now().toString())

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const text = await response.text()
  
  // 百度返回格式: callback({s:["建议1","建议2",...],q:"查询词",...})
  // 提取 JSON 部分
  const match = text.match(/callback\((.+)\)/)
  if (!match) {
    return []
  }

  try {
    const data = JSON.parse(match[1])
    return Array.isArray(data?.s) ? data.s : []
  } catch {
    return []
  }
}

/**
 * 获取必应/谷歌搜索建议（OpenSearch JSON 格式）
 */
async function fetchJsonSuggestions(
  query: string,
  engine: 'bing' | 'google',
  signal: AbortSignal
): Promise<string[]> {
  const url = SUGGESTION_APIS[engine].replace('{query}', encodeURIComponent(query))

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const data = await response.json()
  
  // OpenSearch JSON 格式: [query, [suggestions], ...]
  if (Array.isArray(data) && Array.isArray(data[1])) {
    return data[1].filter((s: unknown) => typeof s === 'string')
  }
  
  return []
}
