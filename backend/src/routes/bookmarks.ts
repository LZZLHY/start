import { Router } from 'express'
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  updateBookmark,
} from '../controllers/bookmarkController'
import { recordBookmarkClick, getUserClickStats } from '../controllers/clickController'
import { requireAuth } from '../middleware/auth'

export const bookmarksRouter = Router()

bookmarksRouter.get('/', requireAuth, listBookmarks)
bookmarksRouter.post('/', requireAuth, createBookmark)
bookmarksRouter.patch('/:id', requireAuth, updateBookmark)
bookmarksRouter.delete('/:id', requireAuth, deleteBookmark)

// 点击统计相关路由
bookmarksRouter.post('/:id/click', requireAuth, recordBookmarkClick)
bookmarksRouter.get('/stats', requireAuth, getUserClickStats)


