/**
 * 站点规范化工具
 * 将 URL 转换为唯一的站点标识符，用于点击统计聚合
 */

/**
 * 从 URL 提取唯一站点标识符
 * - 保留协议和完整主机名（包括子域名和端口）
 * - 忽略路径、查询参数和片段
 * 
 * @example
 * normalizeSite("https://www.baidu.com/search?q=test") => "https://www.baidu.com"
 * normalizeSite("https://fanyi.baidu.com/translate") => "https://fanyi.baidu.com"
 * normalizeSite("http://localhost:3000/api") => "http://localhost:3000"
 * normalizeSite("baidu.com") => "https://baidu.com"
 * 
 * @param url - 要规范化的 URL
 * @returns 规范化的站点标识符，无效 URL 返回 null
 */
export function normalizeSite(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  
  const trimmed = url.trim()
  if (!trimmed) return null
  
  try {
    // 如果没有协议，添加 https://
    let normalizedUrl = trimmed
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl
    }
    
    const parsed = new URL(normalizedUrl)
    
    // 验证协议必须是 http 或 https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    
    // 验证主机名存在且有效
    if (!parsed.hostname) {
      return null
    }
    
    // 构建站点标识符：协议 + 主机名 + 端口（如果非默认）
    let siteId = `${parsed.protocol}//${parsed.hostname}`
    
    // 只有非默认端口才包含在标识符中
    if (parsed.port) {
      const isDefaultPort = 
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')
      
      if (!isDefaultPort) {
        siteId += `:${parsed.port}`
      }
    }
    
    return siteId
  } catch {
    return null
  }
}

/**
 * 从站点标识符提取显示名称
 * 
 * @example
 * getSiteDisplayName("https://www.baidu.com") => "www.baidu.com"
 * getSiteDisplayName("http://localhost:3000") => "localhost:3000"
 * 
 * @param siteId - 站点标识符
 * @returns 显示名称
 */
export function getSiteDisplayName(siteId: string): string {
  if (!siteId || typeof siteId !== 'string') return ''
  
  try {
    const parsed = new URL(siteId)
    let name = parsed.hostname
    
    // 如果有非默认端口，添加到显示名称
    if (parsed.port) {
      const isDefaultPort = 
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')
      
      if (!isDefaultPort) {
        name += `:${parsed.port}`
      }
    }
    
    return name
  } catch {
    return siteId
  }
}

/**
 * 从书签 URL 提取站点标识符
 * 这是 normalizeSite 的别名，用于语义清晰
 * 
 * @param bookmarkUrl - 书签的 URL
 * @returns 站点标识符，无效 URL 返回 null
 */
export function getSiteIdFromUrl(bookmarkUrl: string): string | null {
  return normalizeSite(bookmarkUrl)
}
