import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Response } from 'express'
import type { AuthedRequest } from '../types/auth'

// Mock prisma
vi.mock('../prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

// Mock auth service
vi.mock('../services/auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
  verifyPassword: vi.fn(),
}))

import { prisma } from '../prisma'
import { verifyPassword } from '../services/auth'
import { updateMyProfile, changeMyPassword } from './userController'

describe('userController', () => {
  let mockReq: Partial<AuthedRequest>
  let mockRes: Partial<Response>
  let jsonMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    jsonMock = vi.fn()
    statusMock = vi.fn().mockReturnValue({ json: jsonMock })
    mockRes = {
      status: statusMock,
      json: jsonMock,
    }
  })

  describe('updateMyProfile', () => {
    it('should return 401 if not authenticated', async () => {
      mockReq = { auth: undefined, body: {} }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(401)
    })

    it('should return 400 if username is too short', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { username: 'ab' } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if username is too long', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { username: 'a'.repeat(33) } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if nickname is too short', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { nickname: 'a' } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if nickname is too long', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { nickname: 'a'.repeat(33) } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if email is invalid', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { email: 'invalid-email' } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if phone is too short', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { phone: '12345' } }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if no fields to update', async () => {
      mockReq = { auth: { userId: 'user1' }, body: {} }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should update profile with valid data', async () => {
      const mockUser = {
        id: 'user1',
        username: 'newuser',
        nickname: 'New Nick',
        email: 'new@email.com',
        phone: '1234567890',
        role: 'USER',
        createdAt: new Date(),
      }
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      mockReq = {
        auth: { userId: 'user1' },
        body: {
          username: 'newuser',
          nickname: 'New Nick',
          email: 'new@email.com',
          phone: '1234567890',
        },
      }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(jsonMock).toHaveBeenCalledWith({ ok: true, data: { user: mockUser } })
    })

    it('should allow clearing email and phone with null', async () => {
      const mockUser = {
        id: 'user1',
        username: 'testuser',
        nickname: 'Test',
        email: null,
        phone: null,
        role: 'USER',
        createdAt: new Date(),
      }
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      mockReq = {
        auth: { userId: 'user1' },
        body: { email: null, phone: null },
      }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: null, phone: null }),
        })
      )
    })

    it('should return 409 on unique constraint violation', async () => {
      vi.mocked(prisma.user.update).mockRejectedValue(new Error('Unique constraint failed'))

      mockReq = {
        auth: { userId: 'user1' },
        body: { username: 'existinguser' },
      }
      await updateMyProfile(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(409)
    })
  })

  describe('changeMyPassword', () => {
    it('should return 401 if not authenticated', async () => {
      mockReq = { auth: undefined, body: {} }
      await changeMyPassword(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(401)
    })

    it('should return 400 if currentPassword is empty', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { currentPassword: '', newPassword: 'newpass123' } }
      await changeMyPassword(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 400 if newPassword is too short', async () => {
      mockReq = { auth: { userId: 'user1' }, body: { currentPassword: 'oldpass', newPassword: '12345' } }
      await changeMyPassword(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(400)
    })

    it('should return 401 if current password is wrong', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'hash' } as any)
      vi.mocked(verifyPassword).mockResolvedValue(false)

      mockReq = {
        auth: { userId: 'user1' },
        body: { currentPassword: 'wrongpass', newPassword: 'newpass123' },
      }
      await changeMyPassword(mockReq as AuthedRequest, mockRes as Response)
      expect(statusMock).toHaveBeenCalledWith(401)
    })

    it('should change password with valid data', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'hash' } as any)
      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)

      mockReq = {
        auth: { userId: 'user1' },
        body: { currentPassword: 'correctpass', newPassword: 'newpass123' },
      }
      await changeMyPassword(mockReq as AuthedRequest, mockRes as Response)
      expect(jsonMock).toHaveBeenCalledWith({ ok: true, data: { message: '密码修改成功' } })
    })
  })
})
