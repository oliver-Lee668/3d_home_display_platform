import { useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import { ROLE_LABEL, useAuth, type StaffRole } from '../lib/auth'
import { Icon } from './icons'

/** 本端可接受的角色：管理员在两端都能登录 */
function roleAccepted(endpoint: 'sales' | 'production', userRole: StaffRole): boolean {
  if (userRole === 'admin') return true
  return userRole === endpoint
}

function errText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message
  return e instanceof Error ? e.message : fallback
}

/**
 * 员工端登录门禁。
 *
 * 注意：这只是界面层的门禁，真正的权限在后端逐请求校验——
 * 即便有人绕过本组件直接调接口，没有对应角色的 token 也会被 401/403 拦下。
 */
export function LoginGate({
  endpoint,
  children,
}: {
  endpoint: 'sales' | 'production'
  children: ReactNode
}) {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  if (!token || !user) return <LoginForm endpoint={endpoint} />

  if (!roleAccepted(endpoint, user.role)) {
    return (
      <Shell title={`${ROLE_LABEL[endpoint]}登录`}>
        <p className="text-[13px] leading-relaxed text-slate-300">
          当前登录账号 <b className="text-slate-100">{user.displayName}</b> 属于
          <b className="text-slate-100">{ROLE_LABEL[user.role]}</b>，
          无权使用{ROLE_LABEL[endpoint]}端。请退出后改用对应部门的账号登录。
        </p>
        <button onClick={signOut} className={btnPrimary}>
          退出登录
        </button>
      </Shell>
    )
  }

  if (user.mustChange) return <ForcePasswordChange />

  return <>{children}</>
}

const btnPrimary =
  'w-full rounded-lg bg-brand-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-brand-500 disabled:opacity-50'
const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-brand-500'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 p-4">
      <div className="panel w-full max-w-sm rounded-2xl p-6">
        <div className="mb-5 flex items-center gap-2">
          <Icon name="cube" className="text-brand-500" size={20} />
          <span className="text-[15px] font-semibold text-slate-100">{title}</span>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  )
}

function LoginForm({ endpoint }: { endpoint: 'sales' | 'production' }) {
  const signIn = useAuth((s) => s.signIn)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名与密码')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(username.trim(), password)
      signIn(res.token, res.user, remember)
    } catch (err) {
      setError(errText(err, '登录失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title={`${ROLE_LABEL[endpoint]} · 员工登录`}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block text-[12px] text-slate-400">
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className={inputCls + ' mt-1'}
            placeholder="如 sales01"
          />
        </label>
        <label className="block text-[12px] text-slate-400">
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={inputCls + ' mt-1'}
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-slate-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          记住我（否则关闭标签页即需重新登录）
        </label>

        {error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>
        )}

        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>

      <p className="pt-1 text-[11px] leading-relaxed text-slate-600">
        首次部署会自动播种 sales01 / prod01 / admin 三个账号，初始密码见后端启动日志，首次登录后必须修改。
        <br />
        账号被停用或连续失败过多会被临时锁定。
      </p>
    </Shell>
  )
}

/** 初始密码未修改时强制改密：此时后端只放行 /api/me 与 /api/change-password */
function ForcePasswordChange() {
  const user = useAuth((s) => s.user)
  const patchUser = useAuth((s) => s.patchUser)
  const signOut = useAuth((s) => s.signOut)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('新密码至少 8 位，且同时包含字母与数字')
      return
    }
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(oldPassword, newPassword)
      patchUser({ mustChange: false })
    } catch (err) {
      setError(errText(err, '修改失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="请修改初始密码">
      <p className="text-[12px] leading-relaxed text-slate-400">
        {user?.displayName}，你仍在使用初始密码。为保障订单与图纸安全，
        <b className="text-slate-200">修改密码前无法进入确认台</b>。
      </p>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block text-[12px] text-slate-400">
          当前密码
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            className={inputCls + ' mt-1'}
          />
        </label>
        <label className="block text-[12px] text-slate-400">
          新密码
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className={inputCls + ' mt-1'}
            placeholder="至少 8 位，含字母与数字"
          />
        </label>
        <label className="block text-[12px] text-slate-400">
          确认新密码
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={inputCls + ' mt-1'}
          />
        </label>

        {error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>
        )}

        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? '提交中…' : '修改密码并进入'}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-lg border border-white/15 px-3 py-2 text-[12px] text-slate-300 hover:bg-white/10"
        >
          换个账号登录
        </button>
      </form>
    </Shell>
  )
}
