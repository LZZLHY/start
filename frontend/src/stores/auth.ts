import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiFetch } from '../services/api'
import { useAppearanceStore } from './appearance'
import { useBookmarkDndStore } from './bookmarkDnd'

export type User = {
  id: string
  username: string
  email: string | null
  phone: string | null
  nickname: string
  role: 'USER' | 'ADMIN' | 'ROOT'
  createdAt: string
}

type AuthState = {
  token: string
  user: User | null

  setAuth: (token: string, user: User) => void
  logout: () => void

  login: (identifier: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>
  register: (input: {
    username: string
    password: string
    email?: string
    phone?: string
    nickname?: string
  }) => Promise<{ ok: true } | { ok: false; message: string }>
  refreshMe: () => Promise<void>
  updateNickname: (nickname: string) => Promise<{ ok: true } | { ok: false; message: string }>
  updateProfile: (data: {
    username?: string
    nickname?: string
    email?: string | null
    phone?: string | null
  }) => Promise<{ ok: true } | { ok: false; message: string }>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: true } | { ok: false; message: string }>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      user: null,

      setAuth: (token, user) => set({ token, user }),
      logout: () => {
        // 重置所有用户相关设置为默认值
        useAppearanceStore.getState().resetAppearance()
        useBookmarkDndStore.getState().resetBookmarkDnd()
        set({ token: '', user: null })
      },

      login: async (identifier, password) => {
        const resp = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        })
        if (!resp.ok) return { ok: false, message: resp.message }
        set({ token: resp.data.token, user: resp.data.user })
        return { ok: true }
      },

      register: async (input) => {
        const resp = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        if (!resp.ok) return { ok: false, message: resp.message }
        set({ token: resp.data.token, user: resp.data.user })
        return { ok: true }
      },

      refreshMe: async () => {
        const token = get().token
        if (!token) return
        const resp = await apiFetch<{ user: User }>('/api/auth/me', { method: 'GET', token })
        if (!resp.ok) {
          set({ token: '', user: null })
          return
        }
        set({ user: resp.data.user })
      },

      updateNickname: async (nickname) => {
        const token = get().token
        if (!token) return { ok: false, message: '未登录' }
        const resp = await apiFetch<{ user: User }>('/api/users/me/nickname', {
          method: 'PATCH',
          token,
          body: JSON.stringify({ nickname }),
        })
        if (!resp.ok) return { ok: false, message: resp.message }
        set({ user: resp.data.user })
        return { ok: true }
      },

      updateProfile: async (data) => {
        const token = get().token
        if (!token) return { ok: false, message: '未登录' }
        const resp = await apiFetch<{ user: User }>('/api/users/me/profile', {
          method: 'PATCH',
          token,
          body: JSON.stringify(data),
        })
        if (!resp.ok) return { ok: false, message: resp.message }
        set({ user: resp.data.user })
        return { ok: true }
      },

      changePassword: async (currentPassword, newPassword) => {
        const token = get().token
        if (!token) return { ok: false, message: '未登录' }
        const resp = await apiFetch<{ message: string }>('/api/users/me/password', {
          method: 'PATCH',
          token,
          body: JSON.stringify({ currentPassword, newPassword }),
        })
        if (!resp.ok) return { ok: false, message: resp.message }
        return { ok: true }
      },
    }),
    {
      name: 'start:auth',
      version: 1,
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
)


