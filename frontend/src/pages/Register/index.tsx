import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuthStore } from '../../stores/auth'

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)

  const identifierOk = useMemo(
    () => Boolean(username.trim()) || Boolean(email.trim()) || Boolean(phone.trim()),
    [username, email, phone],
  )
  const disabled = useMemo(
    () => loading || !password || !identifierOk,
    [loading, password, identifierOk],
  )

  const onSubmit = async () => {
    if (disabled) return
    setLoading(true)
    try {
      const resp = await register({
        username: username.trim() || 'user_' + Date.now(),
        password,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        nickname: nickname.trim() || undefined,
      })
      if (!resp.ok) {
        toast.error(resp.message)
        return
      }
      toast.success('注册成功，已自动登录')
      navigate('/', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="glass-modal rounded-2xl p-6 sm:p-8 text-left animate-in fade-in zoom-in-95 duration-200">
        <div className="text-xl font-semibold text-fg">注册</div>

        <div className="mt-6 space-y-3">
          <div className="space-y-2">
            <div className="text-sm text-fg/80">账号（选填）</div>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm text-fg/80">密码</div>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              type="password"
              autoComplete="new-password"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-sm text-fg/80">邮箱（选填）</div>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
                type="email"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-fg/80">手机号（选填）</div>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-fg/80">昵称（选填）</div>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="请输入昵称"
              autoComplete="nickname"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit()
              }}
            />
            {!identifierOk && (
              <div className="text-xs text-red-200">账号/邮箱/手机号至少填一个</div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-sm text-fg/70">
            已有账号？{' '}
            <NavLink to="/login" className="text-primary hover:underline">
              去登录
            </NavLink>
          </div>
          <Button variant="primary" onClick={onSubmit} disabled={disabled}>
            {loading ? '注册中…' : '注册'}
          </Button>
        </div>
      </div>
    </div>
  )
}


