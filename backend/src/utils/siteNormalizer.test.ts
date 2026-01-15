/**
 * 站点规范化工具属性测试
 * Feature: bookmark-click-stats
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeSite, getSiteDisplayName } from './siteNormalizer'

/**
 * 生成有效的主机名
 */
const validHostname = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(s))

/**
 * 生成有效的域名（带 TLD）
 */
const validDomain = fc.tuple(
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z0-9]+$/.test(s)),
  fc.string({ minLength: 2, maxLength: 5 }).filter(s => /^[a-z]+$/.test(s))
).map(([name, tld]) => `${name}.${tld}`)

/**
 * 生成有效的子域名
 */
const validSubdomain = fc.string({ minLength: 1, maxLength: 10 })
  .filter(s => /^[a-z0-9]+$/.test(s))

/**
 * 生成有效的路径
 */
const validPath = fc.array(
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z0-9-_]+$/.test(s)),
  { minLength: 0, maxLength: 3 }
).map(parts => parts.length > 0 ? '/' + parts.join('/') : '')

/**
 * 生成有效的查询参数
 */
const validQuery = fc.array(
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-z]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z0-9]+$/.test(s))
  ),
  { minLength: 0, maxLength: 3 }
).map(pairs => pairs.length > 0 ? '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&') : '')

/**
 * 生成有效的片段
 */
const validFragment = fc.string({ minLength: 0, maxLength: 10 })
  .filter(s => s === '' || /^[a-z0-9-_]+$/.test(s))
  .map(s => s ? '#' + s : '')

/**
 * 生成完整的有效 URL
 */
const validUrl = fc.record({
  protocol: fc.constantFrom('http://', 'https://'),
  subdomain: fc.option(validSubdomain, { nil: undefined }),
  domain: validDomain,
  port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
  path: validPath,
  query: validQuery,
  fragment: validFragment,
}).map(({ protocol, subdomain, domain, port, path, query, fragment }) => {
  let url = protocol
  if (subdomain) url += subdomain + '.'
  url += domain
  if (port) url += ':' + port
  url += path + query + fragment
  return url
})

describe('Site Normalizer', () => {
  /**
   * Property 1: Site Normalization Idempotence
   * Feature: bookmark-click-stats, Property 1: Site Normalization Idempotence
   * 
   * For any valid URL, calling normalizeSite multiple times SHALL always produce
   * the same site identifier, and the result SHALL contain only the protocol
   * and hostname (no path, query, or fragment).
   * 
   * Validates: Requirements 1.1, 1.2, 1.4
   */
  it('Property 1: normalizeSite is idempotent and strips path/query/fragment', () => {
    fc.assert(
      fc.property(validUrl, (url) => {
        const result1 = normalizeSite(url)
        
        // 结果不应为 null（有效 URL）
        expect(result1).not.toBeNull()
        
        // 幂等性：多次调用结果相同
        const result2 = normalizeSite(result1!)
        expect(result2).toBe(result1)
        
        // 结果不应包含路径部分（协议后的斜杠除外）
        const urlPart = result1!.replace(/^https?:\/\//, '')
        expect(urlPart).not.toContain('/')
        expect(result1).not.toContain('?')
        expect(result1).not.toContain('#')
        
        // 结果应以协议开头
        expect(result1!.startsWith('http://') || result1!.startsWith('https://')).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2: Subdomain Distinction
   * Feature: bookmark-click-stats, Property 2: Subdomain Distinction
   * 
   * For any two URLs where only the subdomain differs, the Site_Normalizer
   * SHALL produce different site identifiers.
   * 
   * Validates: Requirements 1.3
   */
  it('Property 2: different subdomains produce different site identifiers', () => {
    fc.assert(
      fc.property(
        validDomain,
        validSubdomain,
        validSubdomain,
        fc.constantFrom('http://', 'https://'),
        (domain, sub1, sub2, protocol) => {
          // 确保两个子域名不同
          fc.pre(sub1 !== sub2)
          
          const url1 = `${protocol}${sub1}.${domain}/page`
          const url2 = `${protocol}${sub2}.${domain}/page`
          
          const site1 = normalizeSite(url1)
          const site2 = normalizeSite(url2)
          
          // 两个站点标识符应该不同
          expect(site1).not.toBe(site2)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3: Invalid URL Handling
   * Feature: bookmark-click-stats, Property 3: Invalid URL Handling
   * 
   * For any invalid URL string (empty, malformed), the Site_Normalizer
   * SHALL return null.
   * 
   * Validates: Requirements 1.5
   */
  it('Property 3: invalid URLs return null', () => {
    // 空字符串
    expect(normalizeSite('')).toBeNull()
    expect(normalizeSite('   ')).toBeNull()
    
    // null/undefined 类型
    expect(normalizeSite(null as any)).toBeNull()
    expect(normalizeSite(undefined as any)).toBeNull()
    
    // 非字符串类型
    expect(normalizeSite(123 as any)).toBeNull()
    expect(normalizeSite({} as any)).toBeNull()
    
    // 注意：ftp:// 等协议会被当作主机名的一部分，因为我们会自动添加 https://
    // 这是预期行为，因为用户可能输入 "ftp.example.com" 这样的主机名
    
    // 属性测试：随机无效字符串
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          fc.constant('://missing-protocol.com'),
        ),
        (invalidUrl) => {
          const result = normalizeSite(invalidUrl)
          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 单元测试：具体示例验证
   */
  describe('Unit Tests', () => {
    it('should normalize URLs correctly', () => {
      // 基本 URL
      expect(normalizeSite('https://www.baidu.com')).toBe('https://www.baidu.com')
      expect(normalizeSite('https://www.baidu.com/')).toBe('https://www.baidu.com')
      expect(normalizeSite('https://www.baidu.com/search')).toBe('https://www.baidu.com')
      expect(normalizeSite('https://www.baidu.com/search?q=test')).toBe('https://www.baidu.com')
      expect(normalizeSite('https://www.baidu.com/search?q=test#section')).toBe('https://www.baidu.com')
      
      // 子域名区分
      expect(normalizeSite('https://fanyi.baidu.com')).toBe('https://fanyi.baidu.com')
      expect(normalizeSite('https://fanyi.baidu.com')).not.toBe(normalizeSite('https://www.baidu.com'))
      
      // 自动添加协议
      expect(normalizeSite('baidu.com')).toBe('https://baidu.com')
      expect(normalizeSite('www.baidu.com')).toBe('https://www.baidu.com')
      
      // 端口处理
      expect(normalizeSite('http://localhost:3000')).toBe('http://localhost:3000')
      expect(normalizeSite('http://localhost:3000/api')).toBe('http://localhost:3000')
      expect(normalizeSite('https://example.com:443')).toBe('https://example.com') // 默认端口被省略
      expect(normalizeSite('http://example.com:80')).toBe('http://example.com') // 默认端口被省略
      expect(normalizeSite('https://example.com:8080')).toBe('https://example.com:8080') // 非默认端口保留
    })

    it('should extract display name correctly', () => {
      expect(getSiteDisplayName('https://www.baidu.com')).toBe('www.baidu.com')
      expect(getSiteDisplayName('https://fanyi.baidu.com')).toBe('fanyi.baidu.com')
      expect(getSiteDisplayName('http://localhost:3000')).toBe('localhost:3000')
      expect(getSiteDisplayName('https://example.com')).toBe('example.com')
    })
  })
})
