/**
 * 点击统计服务单元测试
 * Feature: bookmark-click-stats
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { prisma } from '../prisma'
import {
  recordClick,
  getUserStats,
  getGlobalStats,
  getHeatRanking,
  getUserClickCount,
} from './clickStats'

// 测试用的站点 ID
const TEST_SITE_1 = 'https://test-click-site-1.com'
const TEST_SITE_2 = 'https://test-click-site-2.com'

// 测试用户 ID（将在 beforeAll 中创建）
let TEST_USER_1: string
let TEST_USER_2: string

describe('Click Stats Service', () => {
  // 创建测试用户
  beforeAll(async () => {
    // 创建测试用户1
    const user1 = await prisma.user.create({
      data: {
        username: 'click_test_user_1_' + Date.now(),
        nickname: 'Click Test User 1',
        passwordHash: 'test-hash',
      },
    })
    TEST_USER_1 = user1.id

    // 创建测试用户2
    const user2 = await prisma.user.create({
      data: {
        username: 'click_test_user_2_' + Date.now(),
        nickname: 'Click Test User 2',
        passwordHash: 'test-hash',
      },
    })
    TEST_USER_2 = user2.id
  })

  // 每个测试前清理点击统计数据
  beforeEach(async () => {
    await prisma.clickStat.deleteMany({
      where: {
        userId: { in: [TEST_USER_1, TEST_USER_2] }
      }
    })
  })

  // 清理测试数据
  afterAll(async () => {
    // 删除测试用户（级联删除会自动删除相关的 ClickStat）
    await prisma.user.deleteMany({
      where: {
        id: { in: [TEST_USER_1, TEST_USER_2] }
      }
    })
  })

  describe('recordClick', () => {
    it('should create a new record for first click', async () => {
      const record = await recordClick(TEST_USER_1, TEST_SITE_1)
      
      expect(record.userId).toBe(TEST_USER_1)
      expect(record.siteId).toBe(TEST_SITE_1)
      expect(record.clickCount).toBe(1)
    })

    it('should increment click count on subsequent clicks', async () => {
      // 第一次点击
      await recordClick(TEST_USER_1, TEST_SITE_1)
      
      // 第二次点击
      const record2 = await recordClick(TEST_USER_1, TEST_SITE_1)
      expect(record2.clickCount).toBe(2)
      
      // 第三次点击
      const record3 = await recordClick(TEST_USER_1, TEST_SITE_1)
      expect(record3.clickCount).toBe(3)
    })

    it('should track clicks separately for different users', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      
      const count1 = await getUserClickCount(TEST_USER_1, TEST_SITE_1)
      const count2 = await getUserClickCount(TEST_USER_2, TEST_SITE_1)
      
      expect(count1).toBe(2)
      expect(count2).toBe(1)
    })

    it('should track clicks separately for different sites', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_2)
      
      const count1 = await getUserClickCount(TEST_USER_1, TEST_SITE_1)
      const count2 = await getUserClickCount(TEST_USER_1, TEST_SITE_2)
      
      expect(count1).toBe(2)
      expect(count2).toBe(1)
    })
  })

  describe('getUserStats', () => {
    it('should return empty stats for user with no clicks', async () => {
      const { stats } = await getUserStats(TEST_USER_1)
      
      expect(Object.keys(stats).length).toBe(0)
    })

    it('should return all site stats for user', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_2)
      
      const { stats } = await getUserStats(TEST_USER_1)
      
      expect(stats[TEST_SITE_1]).toBe(2)
      expect(stats[TEST_SITE_2]).toBe(1)
    })
  })

  describe('getGlobalStats', () => {
    it('should return zero for site with no clicks', async () => {
      const stats = await getGlobalStats('https://no-clicks.com')
      
      expect(stats.globalClicks).toBe(0)
      expect(stats.uniqueUsers).toBe(0)
    })

    it('should aggregate clicks from all users', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      
      const stats = await getGlobalStats(TEST_SITE_1)
      
      expect(stats.globalClicks).toBe(5) // 2 + 3
      expect(stats.uniqueUsers).toBe(2)
    })
  })

  describe('getHeatRanking', () => {
    it('should return empty array when no clicks for test sites', async () => {
      const ranking = await getHeatRanking(10)
      
      // 检查测试站点不在榜单中（因为 beforeEach 已清理）
      const testSites = ranking.filter(r => 
        r.siteId === TEST_SITE_1 || r.siteId === TEST_SITE_2
      )
      expect(testSites.length).toBe(0)
    })

    it('should order by global clicks descending', async () => {
      // 站点1: 5次点击
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      await recordClick(TEST_USER_2, TEST_SITE_1)
      
      // 站点2: 2次点击
      await recordClick(TEST_USER_1, TEST_SITE_2)
      await recordClick(TEST_USER_2, TEST_SITE_2)
      
      const ranking = await getHeatRanking(10)
      
      // 找到我们的测试站点
      const site1Index = ranking.findIndex(r => r.siteId === TEST_SITE_1)
      const site2Index = ranking.findIndex(r => r.siteId === TEST_SITE_2)
      
      // 站点1应该排在站点2前面（点击数更多）
      expect(site1Index).toBeLessThan(site2Index)
      
      // 验证点击数
      const site1 = ranking.find(r => r.siteId === TEST_SITE_1)
      const site2 = ranking.find(r => r.siteId === TEST_SITE_2)
      
      expect(site1?.globalClicks).toBe(5)
      expect(site2?.globalClicks).toBe(2)
    })

    it('should respect limit parameter', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_2)
      
      const ranking = await getHeatRanking(1)
      
      expect(ranking.length).toBeLessThanOrEqual(1)
    })
  })

  describe('getUserClickCount', () => {
    it('should return 0 for non-existent record', async () => {
      const count = await getUserClickCount(TEST_USER_1, 'https://never-clicked.com')
      
      expect(count).toBe(0)
    })

    it('should return correct count for existing record', async () => {
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      await recordClick(TEST_USER_1, TEST_SITE_1)
      
      const count = await getUserClickCount(TEST_USER_1, TEST_SITE_1)
      
      expect(count).toBe(3)
    })
  })
})
