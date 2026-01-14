import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getSortKey,
  compareNames,
  sortByType,
  sortAlphabetically,
  applySortMode,
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
})
