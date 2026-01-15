import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getSortKey,
  compareNames,
  sortByType,
  sortAlphabetically,
  sortByClickCount,
  applySortMode,
  BookmarkItemWithUrl,
} from './sortBookmarks'
import type { BookmarkItem } from '../types/bookmark'

// 生成随机书签项的 Arbitrary
const bookmarkItemArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constantFrom('LINK' as const, 'FOLDER' as const),
})

// 生成唯一 ID 的书签列表
const uniqueBookmarkListArb = fc.array(bookmarkItemArb, { minLength: 0, maxLength: 20 }).map(items => {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
})

describe('sortBookmarks', () => {
  describe('getSortKey', () => {
    it('should return empty string for empty input', () => {
      expect(getSortKey('')).toBe('')
    })

    it('should convert ASCII to lowercase', () => {
      expect(getSortKey('ABC')).toBe('abc')
      expect(getSortKey('Hello World')).toBe('hello world')
    })

    it('should handle mixed content', () => {
      const key = getSortKey('Test测试123')
      expect(key).toBeTruthy()
    })
  })

  describe('compareNames', () => {
    it('should sort English names alphabetically', () => {
      expect(compareNames('apple', 'banana')).toBeLessThan(0)
      expect(compareNames('banana', 'apple')).toBeGreaterThan(0)
      expect(compareNames('apple', 'apple')).toBe(0)
    })

    it('should be case insensitive', () => {
      expect(compareNames('Apple', 'apple')).toBe(0)
      expect(compareNames('BANANA', 'banana')).toBe(0)
    })

    it('should sort Chinese names by pinyin', () => {
      // 阿 (a) < 北 (b) < 成 (c)
      expect(compareNames('阿里', '北京')).toBeLessThan(0)
      expect(compareNames('北京', '成都')).toBeLessThan(0)
    })
  })

  /**
   * Property 2: Custom Sort Preserves Order
   * For any list of bookmarks and custom order, when sortMode is "custom",
   * the output order SHALL exactly match the custom order (filtered to existing items).
   * 
   * Feature: bookmark-sorting, Property 2: Custom Sort Preserves Order
   * Validates: Requirements 2.3
   */
  describe('Property 2: Custom Sort Preserves Order', () => {
    it('should preserve custom order for existing items', () => {
      fc.assert(
        fc.property(
          uniqueBookmarkListArb,
          (items) => {
            if (items.length === 0) return true

            // 创建一个随机的自定义顺序
            const customOrder = [...items.map(i => i.id)]
            // 随机打乱
            for (let i = customOrder.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[customOrder[i], customOrder[j]] = [customOrder[j], customOrder[i]]
            }

            const result = applySortMode(items, customOrder, 'custom')

            // 验证：结果应该按 customOrder 排序
            const resultSet = new Set(result)
            const filteredCustomOrder = customOrder.filter(id => resultSet.has(id))
            
            expect(result).toEqual(filteredCustomOrder)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should append items not in custom order to the end', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: 'A', type: 'LINK' },
        { id: '2', name: 'B', type: 'LINK' },
        { id: '3', name: 'C', type: 'LINK' },
      ]
      const customOrder = ['2'] // 只有 2 在自定义顺序中

      const result = applySortMode(items, customOrder, 'custom')

      // 2 应该在前面，1 和 3 在后面
      expect(result[0]).toBe('2')
      expect(result.slice(1).sort()).toEqual(['1', '3'])
    })
  })

  /**
   * Property 3: Folders-First Sort Correctness
   * For any list of bookmarks, when sortMode is "folders-first",
   * all folders SHALL appear before all links, and within each group
   * the relative order SHALL match the custom order.
   * 
   * Feature: bookmark-sorting, Property 3: Folders-First Sort Correctness
   * Validates: Requirements 2.4
   */
  describe('Property 3: Folders-First Sort Correctness', () => {
    it('should place all folders before all links', () => {
      fc.assert(
        fc.property(
          uniqueBookmarkListArb,
          (items) => {
            if (items.length === 0) return true

            const customOrder = items.map(i => i.id)
            const result = applySortMode(items, customOrder, 'folders-first')

            // 找到第一个 LINK 的位置
            const itemMap = new Map(items.map(i => [i.id, i]))
            let firstLinkIndex = -1
            let lastFolderIndex = -1

            result.forEach((id, index) => {
              const item = itemMap.get(id)
              if (item?.type === 'LINK' && firstLinkIndex === -1) {
                firstLinkIndex = index
              }
              if (item?.type === 'FOLDER') {
                lastFolderIndex = index
              }
            })

            // 如果有 LINK 和 FOLDER，所有 FOLDER 应该在所有 LINK 之前
            if (firstLinkIndex !== -1 && lastFolderIndex !== -1) {
              expect(lastFolderIndex).toBeLessThan(firstLinkIndex)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve custom order within each type group', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: 'A', type: 'LINK' },
        { id: '2', name: 'B', type: 'FOLDER' },
        { id: '3', name: 'C', type: 'LINK' },
        { id: '4', name: 'D', type: 'FOLDER' },
      ]
      const customOrder = ['1', '2', '3', '4']

      const result = sortByType(items, customOrder, true)

      // 文件夹应该在前：2, 4（保持相对顺序）
      // 链接在后：1, 3（保持相对顺序）
      expect(result).toEqual(['2', '4', '1', '3'])
    })
  })

  /**
   * Property 4: Links-First Sort Correctness
   * For any list of bookmarks, when sortMode is "links-first",
   * all links SHALL appear before all folders, and within each group
   * the relative order SHALL match the custom order.
   * 
   * Feature: bookmark-sorting, Property 4: Links-First Sort Correctness
   * Validates: Requirements 2.5
   */
  describe('Property 4: Links-First Sort Correctness', () => {
    it('should place all links before all folders', () => {
      fc.assert(
        fc.property(
          uniqueBookmarkListArb,
          (items) => {
            if (items.length === 0) return true

            const customOrder = items.map(i => i.id)
            const result = applySortMode(items, customOrder, 'links-first')

            // 找到第一个 FOLDER 的位置
            const itemMap = new Map(items.map(i => [i.id, i]))
            let firstFolderIndex = -1
            let lastLinkIndex = -1

            result.forEach((id, index) => {
              const item = itemMap.get(id)
              if (item?.type === 'FOLDER' && firstFolderIndex === -1) {
                firstFolderIndex = index
              }
              if (item?.type === 'LINK') {
                lastLinkIndex = index
              }
            })

            // 如果有 LINK 和 FOLDER，所有 LINK 应该在所有 FOLDER 之前
            if (firstFolderIndex !== -1 && lastLinkIndex !== -1) {
              expect(lastLinkIndex).toBeLessThan(firstFolderIndex)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve custom order within each type group', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: 'A', type: 'LINK' },
        { id: '2', name: 'B', type: 'FOLDER' },
        { id: '3', name: 'C', type: 'LINK' },
        { id: '4', name: 'D', type: 'FOLDER' },
      ]
      const customOrder = ['1', '2', '3', '4']

      const result = sortByType(items, customOrder, false)

      // 链接应该在前：1, 3（保持相对顺序）
      // 文件夹在后：2, 4（保持相对顺序）
      expect(result).toEqual(['1', '3', '2', '4'])
    })
  })

  /**
   * Property 5: Alphabetical Sort Correctness
   * For any list of bookmarks, when sortMode is "alphabetical",
   * the output SHALL be sorted by name in ascending order,
   * with Chinese characters sorted by pinyin, numbers before letters.
   * 
   * Feature: bookmark-sorting, Property 5: Alphabetical Sort Correctness
   * Validates: Requirements 2.6, 3.1, 3.2, 3.3
   */
  describe('Property 5: Alphabetical Sort Correctness', () => {
    it('should sort items alphabetically', () => {
      fc.assert(
        fc.property(
          uniqueBookmarkListArb,
          (items) => {
            if (items.length <= 1) return true

            const result = applySortMode(items, [], 'alphabetical')
            const itemMap = new Map(items.map(i => [i.id, i]))

            // 验证：结果应该按名称排序
            for (let i = 0; i < result.length - 1; i++) {
              const current = itemMap.get(result[i])
              const next = itemMap.get(result[i + 1])
              if (current && next) {
                const cmp = compareNames(current.name, next.name)
                expect(cmp).toBeLessThanOrEqual(0)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should sort Chinese names by pinyin', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: '北京', type: 'LINK' },
        { id: '2', name: '阿里', type: 'LINK' },
        { id: '3', name: '成都', type: 'LINK' },
      ]

      const result = sortAlphabetically(items)

      // 阿里 (a) < 北京 (b) < 成都 (c)
      expect(result).toEqual(['2', '1', '3'])
    })

    it('should handle mixed Chinese and English', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: 'Google', type: 'LINK' },
        { id: '2', name: '百度', type: 'LINK' },  // baidu
        { id: '3', name: 'Apple', type: 'LINK' },
        { id: '4', name: '淘宝', type: 'LINK' },  // taobao
      ]

      const result = sortAlphabetically(items)
      
      // Apple (a) < 百度 (baidu, b) < Google (g) < 淘宝 (taobao, t)
      expect(result).toEqual(['3', '2', '1', '4'])
    })

    it('should place numbers before letters', () => {
      const items: BookmarkItem[] = [
        { id: '1', name: 'Apple', type: 'LINK' },
        { id: '2', name: '123', type: 'LINK' },
        { id: '3', name: 'Banana', type: 'LINK' },
      ]

      const result = sortAlphabetically(items)

      // 123 应该在 Apple 之前
      const indexOf123 = result.indexOf('2')
      const indexOfApple = result.indexOf('1')
      expect(indexOf123).toBeLessThan(indexOfApple)
    })
  })

  describe('applySortMode', () => {
    it('should return empty array for empty input', () => {
      expect(applySortMode([], [], 'custom')).toEqual([])
      expect(applySortMode([], [], 'folders-first')).toEqual([])
      expect(applySortMode([], [], 'links-first')).toEqual([])
      expect(applySortMode([], [], 'alphabetical')).toEqual([])
    })

    it('should handle single item', () => {
      const items: BookmarkItem[] = [{ id: '1', name: 'Test', type: 'LINK' }]
      
      expect(applySortMode(items, ['1'], 'custom')).toEqual(['1'])
      expect(applySortMode(items, ['1'], 'folders-first')).toEqual(['1'])
      expect(applySortMode(items, ['1'], 'links-first')).toEqual(['1'])
      expect(applySortMode(items, ['1'], 'alphabetical')).toEqual(['1'])
    })
  })

  /**
   * Property 6: Click Count Sorting with Tie-Breaking
   * For any list of bookmarks with click counts, when sortMode is "click-count",
   * items SHALL be sorted by click count in descending order,
   * with ties broken by alphabetical order (pinyin for Chinese).
   * Items with zero clicks SHALL appear at the end.
   * 
   * Feature: bookmark-click-stats, Property 6: Click Count Sorting with Tie-Breaking
   * Validates: Requirements 4.1, 4.2, 4.4
   */
  describe('Property 6: Click Count Sorting with Tie-Breaking', () => {
    // 生成带 URL 的书签项
    const bookmarkItemWithUrlArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      type: fc.constantFrom('LINK' as const, 'FOLDER' as const),
      url: fc.option(fc.webUrl(), { nil: null }),
    })

    // 生成唯一 ID 的书签列表
    const uniqueBookmarkWithUrlListArb = fc.array(bookmarkItemWithUrlArb, { minLength: 0, maxLength: 20 }).map(items => {
      const seen = new Set<string>()
      return items.filter(item => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
    })

    // 简单的 URL 到 siteId 转换函数
    const urlToSiteId = (url: string): string | null => {
      try {
        const parsed = new URL(url)
        return `${parsed.protocol}//${parsed.hostname}`
      } catch {
        return null
      }
    }

    it('should sort by click count descending', () => {
      fc.assert(
        fc.property(
          uniqueBookmarkWithUrlListArb,
          fc.dictionary(fc.webUrl().map(u => urlToSiteId(u) || ''), fc.integer({ min: 0, max: 1000 })),
          (items, clickCounts) => {
            if (items.length <= 1) return true

            const result = sortByClickCount(items, clickCounts, urlToSiteId)
            
            // 验证：结果中的每个项的点击数应该 >= 下一个项的点击数（除了零点击的）
            for (let i = 0; i < result.length - 1; i++) {
              const currentItem = items.find(it => it.id === result[i])
              const nextItem = items.find(it => it.id === result[i + 1])
              
              if (!currentItem || !nextItem) continue
              
              const currentSiteId = currentItem.url ? urlToSiteId(currentItem.url) : null
              const nextSiteId = nextItem.url ? urlToSiteId(nextItem.url) : null
              
              const currentCount = currentSiteId ? (clickCounts[currentSiteId] ?? 0) : 0
              const nextCount = nextSiteId ? (clickCounts[nextSiteId] ?? 0) : 0
              
              // 零点击的应该在最后
              if (currentCount === 0 && nextCount > 0) {
                // 这不应该发生
                expect(currentCount).toBeGreaterThanOrEqual(nextCount)
              }
              
              // 非零点击的应该按降序排列
              if (currentCount > 0 && nextCount > 0) {
                expect(currentCount).toBeGreaterThanOrEqual(nextCount)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should break ties by alphabetical order', () => {
      const items: BookmarkItemWithUrl[] = [
        { id: '1', name: 'Zebra', type: 'LINK', url: 'https://zebra.com' },
        { id: '2', name: 'Apple', type: 'LINK', url: 'https://apple.com' },
        { id: '3', name: 'Banana', type: 'LINK', url: 'https://banana.com' },
      ]
      
      // 所有站点都有相同的点击数
      const clickCounts: Record<string, number> = {
        'https://zebra.com': 10,
        'https://apple.com': 10,
        'https://banana.com': 10,
      }

      const result = sortByClickCount(items, clickCounts, urlToSiteId)

      // 相同点击数应该按字母排序：Apple < Banana < Zebra
      expect(result).toEqual(['2', '3', '1'])
    })

    it('should place zero-click items at the end', () => {
      const items: BookmarkItemWithUrl[] = [
        { id: '1', name: 'A', type: 'LINK', url: 'https://a.com' },
        { id: '2', name: 'B', type: 'LINK', url: 'https://b.com' },
        { id: '3', name: 'C', type: 'LINK', url: 'https://c.com' },
      ]
      
      const clickCounts: Record<string, number> = {
        'https://a.com': 0,
        'https://b.com': 5,
        'https://c.com': 0,
      }

      const result = sortByClickCount(items, clickCounts, urlToSiteId)

      // B 有点击数，应该在前面
      // A 和 C 没有点击数，应该在后面（按字母排序）
      expect(result[0]).toBe('2') // B
      expect(result.slice(1).sort()).toEqual(['1', '3']) // A, C
    })

    it('should handle items without URL', () => {
      const items: BookmarkItemWithUrl[] = [
        { id: '1', name: 'Folder', type: 'FOLDER', url: null },
        { id: '2', name: 'Link', type: 'LINK', url: 'https://link.com' },
      ]
      
      const clickCounts: Record<string, number> = {
        'https://link.com': 10,
      }

      const result = sortByClickCount(items, clickCounts, urlToSiteId)

      // Link 有点击数，应该在前面
      // Folder 没有 URL，视为零点击，在后面
      expect(result).toEqual(['2', '1'])
    })

    it('should sort Chinese names by pinyin when click counts are equal', () => {
      const items: BookmarkItemWithUrl[] = [
        { id: '1', name: '成都', type: 'LINK', url: 'https://chengdu.com' },
        { id: '2', name: '阿里', type: 'LINK', url: 'https://ali.com' },
        { id: '3', name: '北京', type: 'LINK', url: 'https://beijing.com' },
      ]
      
      const clickCounts: Record<string, number> = {
        'https://chengdu.com': 5,
        'https://ali.com': 5,
        'https://beijing.com': 5,
      }

      const result = sortByClickCount(items, clickCounts, urlToSiteId)

      // 相同点击数按拼音排序：阿里 (a) < 北京 (b) < 成都 (c)
      expect(result).toEqual(['2', '3', '1'])
    })
  })
})
