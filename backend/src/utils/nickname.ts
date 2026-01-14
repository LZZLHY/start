import { prisma } from '../prisma'

function randomDigits(len: number) {
  let s = ''
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10).toString()
  return s
}

export async function generateUniqueNickname(prefix = '用户'): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = `${prefix}${randomDigits(6)}`
    const existed = await prisma.user.findUnique({ where: { nickname: candidate } })
    if (!existed) return candidate
  }
  // 极小概率：一直撞车，则加长
  const candidate = `${prefix}${Date.now()}${randomDigits(3)}`
  return candidate
}

export async function generateUniqueUsername(prefix = 'user'): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = `${prefix}${randomDigits(8)}`
    const existed = await prisma.user.findUnique({ where: { username: candidate } })
    if (!existed) return candidate
  }
  // 极小概率：一直撞车，则加长
  const candidate = `${prefix}${Date.now()}${randomDigits(3)}`
  return candidate
}


