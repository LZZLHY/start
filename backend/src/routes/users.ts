import { Router } from 'express'
import { updateMyNickname, updateMyProfile, changeMyPassword } from '../controllers/userController'
import { requireAuth } from '../middleware/auth'

export const usersRouter = Router()

usersRouter.patch('/me/nickname', requireAuth, updateMyNickname)
usersRouter.patch('/me/profile', requireAuth, updateMyProfile)
usersRouter.patch('/me/password', requireAuth, changeMyPassword)


