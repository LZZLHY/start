import { Router } from 'express'
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  updateBookmark,
} from '../controllers/bookmarkController'
import { recordBookmarkClick, getUserClickStats, getRecentClickedBookmarks } from '../controllers/clickController'
import { requireAuth } from '../middleware/auth'

export const bookmarksRouter = Router()

// 点击统计相关路由（放在 /:id 之前，避免被拦截）
bookmarksRouter.get('/stats', requireAuth, getUserClickStats)
bookmarksRouter.get('/recent', requireAuth, getRecentClickedBookmarks)

bookmarksRouter.get('/', requireAuth, listBookmarks)
bookmarksRouter.post('/', requireAuth, createBookmark)
bookmarksRouter.patch('/:id', requireAuth, updateBookmark)
bookmarksRouter.delete('/:id', requireAuth, deleteBookmark)
bookmarksRouter.post('/:id/click', requireAuth, recordBookmarkClick)


