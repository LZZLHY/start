import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { fetchTitleHandler, searchSuggestionsHandler } from '../controllers/utilsController'

const router = Router()

// All utils routes require authentication
router.use(requireAuth)

// POST /api/utils/fetch-title - Fetch website title from URL
router.post('/fetch-title', fetchTitleHandler)

// GET /api/utils/search-suggestions - Proxy search suggestions from search engines
router.get('/search-suggestions', searchSuggestionsHandler)

export default router
