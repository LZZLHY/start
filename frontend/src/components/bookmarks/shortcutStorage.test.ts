import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  shortcutStorageKey,
  getShortcutSet,
  saveShortcutSet,
  addToShortcutSet,
  removeFromShortcutSet,
  cleanupShortcutSet,
} from './shortcutStorage'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('shortcutStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('shortcutStorageKey', () => {
    it('should generate correct storage key', () => {
      expect(shortcutStorageKey('user123')).toBe('start:shortcutSet:user123')
      expect(shortcutStorageKey('abc')).toBe('start:shortcutSet:abc')
    })
  })

  describe('getShortcutSet', () => {
    it('should return empty array when no data', () => {
      expect(getShortcutSet('user1')).toEqual([])
    })

    it('should return stored data', () => {
      localStorageMock.setItem('start:shortcutSet:user1', JSON.stringify(['a', 'b']))
      expect(getShortcutSet('user1')).toEqual(['a', 'b'])
    })

    it('should return empty array on invalid JSON', () => {
      localStorageMock.setItem('start:shortcutSet:user1', 'invalid json')
      expect(getShortcutSet('user1')).toEqual([])
    })
  })

  describe('saveShortcutSet', () => {
    it('should save data to localStorage', () => {
      saveShortcutSet('user1', ['x', 'y', 'z'])
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'start:shortcutSet:user1',
        JSON.stringify(['x', 'y', 'z'])
      )
    })
  })

  describe('addToShortcutSet', () => {
    it('should add new id', () => {
      addToShortcutSet('user1', 'id1')
      expect(getShortcutSet('user1')).toEqual(['id1'])
    })

    it('should not add duplicate id', () => {
      saveShortcutSet('user1', ['id1'])
      addToShortcutSet('user1', 'id1')
      expect(getShortcutSet('user1')).toEqual(['id1'])
    })
  })

  describe('removeFromShortcutSet', () => {
    it('should remove existing id', () => {
      saveShortcutSet('user1', ['a', 'b', 'c'])
      removeFromShortcutSet('user1', 'b')
      expect(getShortcutSet('user1')).toEqual(['a', 'c'])
    })

    it('should handle removing non-existent id', () => {
      saveShortcutSet('user1', ['a', 'b'])
      removeFromShortcutSet('user1', 'x')
      expect(getShortcutSet('user1')).toEqual(['a', 'b'])
    })
  })

  describe('cleanupShortcutSet', () => {
    it('should remove invalid ids', () => {
      saveShortcutSet('user1', ['a', 'b', 'c', 'd'])
      const result = cleanupShortcutSet('user1', ['a', 'c', 'e'])
      expect(result).toEqual(['a', 'c'])
      expect(getShortcutSet('user1')).toEqual(['a', 'c'])
    })

    it('should not modify if all ids are valid', () => {
      saveShortcutSet('user1', ['a', 'b'])
      const result = cleanupShortcutSet('user1', ['a', 'b', 'c'])
      expect(result).toEqual(['a', 'b'])
    })
  })

  // Property-based tests
  describe('Property Tests', () => {
    // Property 1: Shortcut Set Subset - 清理后集合是有效 ID 子集
    it('Property 1: cleanupShortcutSet result is always subset of validIds', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 20 }),
          (shortcutIds, validIds) => {
            localStorageMock.clear()
            const userId = 'test-user'
            saveShortcutSet(userId, shortcutIds)
            
            const result = cleanupShortcutSet(userId, validIds)
            const validSet = new Set(validIds)
            
            // 结果中的每个 ID 都应该在 validIds 中
            return result.every(id => validSet.has(id))
          }
        ),
        { numRuns: 100 }
      )
    })

    // Property 2: Add Shortcut Idempotent - 重复添加不产生重复
    it('Property 2: addToShortcutSet is idempotent (no duplicates)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (id, repeatCount) => {
            localStorageMock.clear()
            const userId = 'test-user'
            
            // 重复添加同一个 ID
            for (let i = 0; i < repeatCount; i++) {
              addToShortcutSet(userId, id)
            }
            
            const result = getShortcutSet(userId)
            // 结果中该 ID 只应出现一次
            return result.filter(x => x === id).length === 1
          }
        ),
        { numRuns: 100 }
      )
    })

    // Property 3: Add then Remove returns to original state
    it('Property 3: add then remove returns to original state', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (initialIds, newId) => {
            localStorageMock.clear()
            const userId = 'test-user'
            const uniqueInitial = [...new Set(initialIds)]
            saveShortcutSet(userId, uniqueInitial)
            
            // 如果 newId 不在初始集合中
            if (!uniqueInitial.includes(newId)) {
              addToShortcutSet(userId, newId)
              removeFromShortcutSet(userId, newId)
              const result = getShortcutSet(userId)
              return JSON.stringify(result) === JSON.stringify(uniqueInitial)
            }
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    // Property 4: Remove preserves other elements
    it('Property 4: remove preserves other elements', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 10 }),
          (ids) => {
            localStorageMock.clear()
            const userId = 'test-user'
            const uniqueIds = [...new Set(ids)]
            if (uniqueIds.length < 2) return true
            
            saveShortcutSet(userId, uniqueIds)
            const toRemove = uniqueIds[0]
            const expected = uniqueIds.slice(1)
            
            removeFromShortcutSet(userId, toRemove)
            const result = getShortcutSet(userId)
            
            return JSON.stringify(result) === JSON.stringify(expected)
          }
        ),
        { numRuns: 100 }
      )
    })

    // Property 5: Cleanup preserves order of remaining elements
    it('Property 5: cleanup preserves order of remaining elements', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 10 }),
          (shortcutIds, validIds) => {
            localStorageMock.clear()
            const userId = 'test-user'
            const uniqueShortcuts = [...new Set(shortcutIds)]
            saveShortcutSet(userId, uniqueShortcuts)
            
            const validSet = new Set(validIds)
            const expectedOrder = uniqueShortcuts.filter(id => validSet.has(id))
            
            const result = cleanupShortcutSet(userId, validIds)
            
            return JSON.stringify(result) === JSON.stringify(expectedOrder)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
