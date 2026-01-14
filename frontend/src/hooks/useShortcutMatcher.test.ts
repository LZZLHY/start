import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { shortcutMatcherUtils, type Bookmark } from './useShortcutMatcher'

const { matchBookmarks, getFaviconUrl } = shortcutMatcherUtils

describe('useShortcutMatcher', () => {
  describe('getFaviconUrl', () => {
    it('should generate correct favicon URL', () => {
      const url = 'https://www.example.com/page'
      const favicon = getFaviconUrl(url)
      expect(favicon).toBe('https://www.google.com/s2/favicons?domain=www.example.com&sz=32')
    })

    it('should return empty string for invalid URL', () => {
      const favicon = getFaviconUrl('not-a-valid-url')
      expect(favicon).toBe('')
    })
  })

  /**
   * Property 7: Bookmark matching is case-insensitive partial match
   * For any search query and any bookmark, the bookmark should match if its name
   * contains the query as a substring (case-insensitive).
   * 
   * Feature: search-box-enhancement, Property 7: Bookmark matching is case-insensitive partial match
   * Validates: Requirements 5.1, 5.2
   */
  describe('Property 7: Bookmark matching is case-insensitive partial match', () => {
    it('should match bookmarks case-insensitively', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.uuid(),
          (query, id) => {
            const trimmedQuery = query.trim()
            if (!trimmedQuery) return
            
            // 创建一个名称包含查询的书签（使用不同大小写）
            const variations = [
              trimmedQuery.toUpperCase(),
              trimmedQuery.toLowerCase(),
              trimmedQuery.charAt(0).toUpperCase() + trimmedQuery.slice(1).toLowerCase(),
            ]
            
            for (const variation of variations) {
              const bookmark: Bookmark = {
                id,
                name: `Prefix ${variation} Suffix`,
                url: 'https://example.com',
                type: 'LINK',
              }
              
              const matches = matchBookmarks(trimmedQuery, [bookmark])
              
              // 验证：应该匹配到这个书签
              expect(matches.length).toBe(1)
              expect(matches[0].id).toBe(id)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should perform partial matching', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3),
          fc.uuid(),
          (fullName, id) => {
            const trimmed = fullName.trim()
            if (trimmed.length < 3) return
            
            // 取名称的一部分作为查询
            const partialQuery = trimmed.substring(0, Math.ceil(trimmed.length / 2))
            
            const bookmark: Bookmark = {
              id,
              name: trimmed,
              url: 'https://example.com',
              type: 'LINK',
            }
            
            const matches = matchBookmarks(partialQuery, [bookmark])
            
            // 验证：部分匹配应该成功
            expect(matches.length).toBe(1)
            expect(matches[0].name).toBe(trimmed)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not match when query is not in name', () => {
      // 使用一个确定不会匹配的书签名称
      const bookmark: Bookmark = {
        id: '1',
        name: 'ABC',
        url: 'https://example.com',
        type: 'LINK',
      }
      
      // 查询 "xyz" 不应该匹配 "ABC"
      const matches = matchBookmarks('xyz', [bookmark])
      expect(matches.length).toBe(0)
      
      // 查询 "123" 不应该匹配 "ABC"
      const matches2 = matchBookmarks('123', [bookmark])
      expect(matches2.length).toBe(0)
    })
  })

  /**
   * Property 8: Shortcut match count limit
   * For any number of matching bookmarks, the displayed shortcuts should never
   * exceed 5 items.
   * 
   * Feature: search-box-enhancement, Property 8: Shortcut match count limit
   * Validates: Requirements 5.6
   */
  describe('Property 8: Shortcut match count limit', () => {
    it('should limit results to maxResults', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 50 }),
          (maxResults, bookmarkCount) => {
            // 创建多个匹配的书签
            const bookmarks: Bookmark[] = Array.from({ length: bookmarkCount }, (_, i) => ({
              id: `id-${i}`,
              name: `Test Bookmark ${i}`,
              url: `https://example${i}.com`,
              type: 'LINK' as const,
            }))
            
            const matches = matchBookmarks('Test', bookmarks, maxResults)
            
            // 验证：结果数量不超过 maxResults
            expect(matches.length).toBeLessThanOrEqual(maxResults)
            
            // 验证：如果书签数量大于等于 maxResults，则结果数量等于 maxResults
            if (bookmarkCount >= maxResults) {
              expect(matches.length).toBe(maxResults)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should default to 5 results', () => {
      // 创建 10 个匹配的书签
      const bookmarks: Bookmark[] = Array.from({ length: 10 }, (_, i) => ({
        id: `id-${i}`,
        name: `Test Bookmark ${i}`,
        url: `https://example${i}.com`,
        type: 'LINK' as const,
      }))
      
      const matches = matchBookmarks('Test', bookmarks)
      
      // 验证：默认最多返回 5 个结果
      expect(matches.length).toBe(5)
    })
  })

  describe('Pinyin search', () => {
    it('should match Chinese bookmarks by pinyin', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: '百度', url: 'https://baidu.com', type: 'LINK' },
        { id: '2', name: '淘宝', url: 'https://taobao.com', type: 'LINK' },
        { id: '3', name: '京东', url: 'https://jd.com', type: 'LINK' },
      ]
      
      // 全拼匹配
      const matches1 = matchBookmarks('baidu', bookmarks)
      expect(matches1.length).toBe(1)
      expect(matches1[0].name).toBe('百度')
      
      // 首字母匹配
      const matches2 = matchBookmarks('tb', bookmarks)
      expect(matches2.length).toBe(1)
      expect(matches2[0].name).toBe('淘宝')
      
      // 部分拼音匹配
      const matches3 = matchBookmarks('jing', bookmarks)
      expect(matches3.length).toBe(1)
      expect(matches3[0].name).toBe('京东')
    })

    it('should match mixed Chinese and English names', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: '我的GitHub', url: 'https://github.com', type: 'LINK' },
      ]
      
      // 中文拼音匹配
      const matches1 = matchBookmarks('wode', bookmarks)
      expect(matches1.length).toBe(1)
      
      // 英文部分匹配
      const matches2 = matchBookmarks('GitHub', bookmarks)
      expect(matches2.length).toBe(1)
    })

    it('should still support direct Chinese character matching', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: '百度搜索', url: 'https://baidu.com', type: 'LINK' },
      ]
      
      const matches = matchBookmarks('百度', bookmarks)
      expect(matches.length).toBe(1)
      expect(matches[0].name).toBe('百度搜索')
    })
  })

  describe('Edge cases', () => {
    it('should return empty array for empty query', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: 'Test', url: 'https://example.com', type: 'LINK' },
      ]
      
      expect(matchBookmarks('', bookmarks)).toEqual([])
      expect(matchBookmarks('   ', bookmarks)).toEqual([])
    })

    it('should return empty array for empty bookmarks', () => {
      expect(matchBookmarks('test', [])).toEqual([])
    })

    it('should not match FOLDER type bookmarks', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: 'Test Folder', url: null, type: 'FOLDER' },
        { id: '2', name: 'Test Link', url: 'https://example.com', type: 'LINK' },
      ]
      
      const matches = matchBookmarks('Test', bookmarks)
      
      expect(matches.length).toBe(1)
      expect(matches[0].id).toBe('2')
    })

    it('should not match bookmarks without URL', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: 'Test', url: null, type: 'LINK' },
      ]
      
      const matches = matchBookmarks('Test', bookmarks)
      
      expect(matches.length).toBe(0)
    })

    it('should include favicon in results', () => {
      const bookmarks: Bookmark[] = [
        { id: '1', name: 'Test', url: 'https://www.example.com', type: 'LINK' },
      ]
      
      const matches = matchBookmarks('Test', bookmarks)
      
      expect(matches[0].favicon).toBe('https://www.google.com/s2/favicons?domain=www.example.com&sz=32')
    })
  })
})
