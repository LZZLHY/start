/**
 * 管理员控制器测试
 * Feature: bookmark-click-stats
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { prisma } from '../prisma'
import { getHeatRanking } from '../services/clickStats'

// 测试用户 ID（将在 beforeAll 中创建）
let TEST_USER_1: string
let TEST_USER_2: string
let TEST_USER_3: string

// 测试站点
const TEST_SITES = [
  'https://site-a.com',
  'https://site-b.com',
  'https://site-c.com',
  'https://site-d.com',
  'https://site-e.com',
]

describe('Admin Controller - Heat Ranking', () => {
  // 创建测试用户
  beforeAll(async () => {
    const timestamp = Date.now()
    
    const user1 = await prisma.user.create({
      data: {
        username: `admin_test_user_1_${timestamp}`,
        nickname: 'Admin Test User 1',
        passwordHash: 'test-hash',
      },
    })
    TEST_USER_1 = user1.id

    const user2 = await prisma.user.create({
      data: {
        username: `admin_test_user_2_${timestamp}`,
        nickname: 'Admin Test User 2',
        passwordHash: 'test-hash',
      },
    })
    TEST_USER_2 = user2.id

    const user3 = await prisma.user.create({
      data: {
        username: `admin_test_user_3_${timestamp}`,
        nickname: 'Admin Test User 3',
        passwordHash: 'test-hash',
      },
    })
    TEST_USER_3 = user3.id
  })

  // 每个测试前清理点击统计数据
  beforeEach(async () => {
    await prisma.clickStat.deleteMany({
      where: {
        userId: { in: [TEST_USER_1, TEST_USER_2, TEST_USER_3] }
      }
    })
  })

  // 清理测试数据
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        id: { in: [TEST_USER_1, TEST_USER_2, TEST_USER_3] }
      }
    })
  })

  /**
   * Property 7: Heat Ranking Ordering
   * 热力榜单应该按全局点击数降序排列
   * 相同点击数时按独立用户数降序排列
   */
  describe('Property 7: Heat Ranking Ordering', () => {
    it('should order by global clicks descending', async () => {
      // 创建不同点击数的站点数据
      // Site A: 10 clicks (user1: 5, user2: 3, user3: 2)
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: TEST_SITES[0], clickCount: 5 }
      })
      await prisma.clickStat.create({
        data: { userId: TEST_USER_2, siteId: TEST_SITES[0], clickCount: 3 }
      })
      await prisma.clickStat.create({
        data: { userId: TEST_USER_3, siteId: TEST_SITES[0], clickCount: 2 }
      })

      // Site B: 7 clicks (user1: 7)
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: TEST_SITES[1], clickCount: 7 }
      })

      // Site C: 3 clicks (user2: 3)
      await prisma.clickStat.create({
        data: { userId: TEST_USER_2, siteId: TEST_SITES[2], clickCount: 3 }
      })

      const ranking = await getHeatRanking(10)

      // 找到测试站点
      const siteAIndex = ranking.findIndex(r => r.siteId === TEST_SITES[0])
      const siteBIndex = ranking.findIndex(r => r.siteId === TEST_SITES[1])
      const siteCIndex = ranking.findIndex(r => r.siteId === TEST_SITES[2])

      // Site A (10 clicks) > Site B (7 clicks) > Site C (3 clicks)
      expect(siteAIndex).toBeLessThan(siteBIndex)
      expect(siteBIndex).toBeLessThan(siteCIndex)
    })

    it('should break ties by unique users count', async () => {
      // Site A: 6 clicks from 3 users
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: TEST_SITES[0], clickCount: 2 }
      })
      await prisma.clickStat.create({
        data: { userId: TEST_USER_2, siteId: TEST_SITES[0], clickCount: 2 }
      })
      await prisma.clickStat.create({
        data: { userId: TEST_USER_3, siteId: TEST_SITES[0], clickCount: 2 }
      })

      // Site B: 6 clicks from 1 user
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: TEST_SITES[1], clickCount: 6 }
      })

      const ranking = await getHeatRanking(10)

      const siteA = ranking.find(r => r.siteId === TEST_SITES[0])
      const siteB = ranking.find(r => r.siteId === TEST_SITES[1])

      // 两个站点都有 6 次点击
      expect(siteA?.globalClicks).toBe(6)
      expect(siteB?.globalClicks).toBe(6)

      // Site A 有 3 个独立用户，Site B 只有 1 个
      expect(siteA?.uniqueUsers).toBe(3)
      expect(siteB?.uniqueUsers).toBe(1)

      // Site A 应该排在 Site B 前面
      const siteAIndex = ranking.findIndex(r => r.siteId === TEST_SITES[0])
      const siteBIndex = ranking.findIndex(r => r.siteId === TEST_SITES[1])
      expect(siteAIndex).toBeLessThan(siteBIndex)
    })

    it('should maintain ordering property with random data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机点击数据
          fc.array(
            fc.record({
              siteIndex: fc.integer({ min: 0, max: 4 }),
              userIndex: fc.integer({ min: 0, max: 2 }),
              clickCount: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clickData) => {
            // 清理之前的数据
            await prisma.clickStat.deleteMany({
              where: {
                userId: { in: [TEST_USER_1, TEST_USER_2, TEST_USER_3] }
              }
            })

            // 创建点击数据
            const users = [TEST_USER_1, TEST_USER_2, TEST_USER_3]
            for (const data of clickData) {
              const userId = users[data.userIndex]
              const siteId = TEST_SITES[data.siteIndex]
              
              await prisma.clickStat.upsert({
                where: { userId_siteId: { userId, siteId } },
                create: { userId, siteId, clickCount: data.clickCount },
                update: { clickCount: { increment: data.clickCount } },
              })
            }

            const ranking = await getHeatRanking(10)

            // 验证排序：每个项的 globalClicks >= 下一个项的 globalClicks
            for (let i = 0; i < ranking.length - 1; i++) {
              const current = ranking[i]
              const next = ranking[i + 1]
              
              // 点击数应该降序
              expect(current.globalClicks).toBeGreaterThanOrEqual(next.globalClicks)
              
              // 如果点击数相同，用户数应该降序
              if (current.globalClicks === next.globalClicks) {
                expect(current.uniqueUsers).toBeGreaterThanOrEqual(next.uniqueUsers)
              }
            }
          }
        ),
        { numRuns: 50 } // 减少运行次数以加快测试
      )
    })
  })

  /**
   * Property 8: Heat Ranking Data Completeness
   * 热力榜单应该包含完整的数据字段
   */
  describe('Property 8: Heat Ranking Data Completeness', () => {
    it('should include all required fields', async () => {
      // 创建一些测试数据
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: TEST_SITES[0], clickCount: 5 }
      })
      await prisma.clickStat.create({
        data: { userId: TEST_USER_2, siteId: TEST_SITES[0], clickCount: 3 }
      })

      const ranking = await getHeatRanking(10)
      const testSite = ranking.find(r => r.siteId === TEST_SITES[0])

      expect(testSite).toBeDefined()
      expect(testSite).toHaveProperty('siteId')
      expect(testSite).toHaveProperty('siteName')
      expect(testSite).toHaveProperty('globalClicks')
      expect(testSite).toHaveProperty('uniqueUsers')

      // 验证数据类型
      expect(typeof testSite!.siteId).toBe('string')
      expect(typeof testSite!.siteName).toBe('string')
      expect(typeof testSite!.globalClicks).toBe('number')
      expect(typeof testSite!.uniqueUsers).toBe('number')

      // 验证数据正确性
      expect(testSite!.globalClicks).toBe(8) // 5 + 3
      expect(testSite!.uniqueUsers).toBe(2)
    })

    it('should respect limit parameter', async () => {
      // 创建多个站点的数据
      for (let i = 0; i < TEST_SITES.length; i++) {
        await prisma.clickStat.create({
          data: { userId: TEST_USER_1, siteId: TEST_SITES[i], clickCount: 10 - i }
        })
      }

      // 测试不同的 limit 值
      const ranking3 = await getHeatRanking(3)
      const ranking5 = await getHeatRanking(5)
      const ranking10 = await getHeatRanking(10)

      expect(ranking3.length).toBeLessThanOrEqual(3)
      expect(ranking5.length).toBeLessThanOrEqual(5)
      expect(ranking10.length).toBeLessThanOrEqual(10)
    })

    it('should generate valid site names', async () => {
      await prisma.clickStat.create({
        data: { userId: TEST_USER_1, siteId: 'https://www.example.com', clickCount: 1 }
      })

      const ranking = await getHeatRanking(10)
      const site = ranking.find(r => r.siteId === 'https://www.example.com')

      expect(site).toBeDefined()
      expect(site!.siteName).toBeTruthy()
      expect(site!.siteName.length).toBeGreaterThan(0)
    })
  })
})
