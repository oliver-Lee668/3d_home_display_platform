import { create } from 'zustand'

/**
 * 员工会话（销售/生产端）。
 *
 * 说明：前端角色（VITE_APP_ROLE）只决定"渲染哪套界面"，
 * 真正的权限由后端按 token 里的 role 逐请求判定，因此这里的 role 仅用于界面展示。
 * 客户展示端不使用本模块——客户免登录，查单靠"订单号 + 手机号"双因子。
 */
export type StaffRole = 'sales' | 'production' | 'admin'

export interface SessionUser {
  username: string
  role: StaffRole
  displayName: string
  /** 仍在用初始密码：必须先改密才能进入确认台 */
  mustChange: boolean
}

/** 「记住我」时用 localStorage，否则用 sessionStorage（关标签页即失效） */
const LS_TOKEN = 'fs_staff_token'
const SS_TOKEN = 'fs_staff_token.session'
const LS_USER = 'fs_staff_user'

function safeGet(area: 'local' | 'session', key: string): string | null {
  try {
    return (area === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return null // 隐私模式下 storage 可能不可用
  }
}

function safeSet(area: 'local' | 'session', key: string, value: string): void {
  try {
    ;(area === 'local' ? localStorage : sessionStorage).setItem(key, value)
  } catch {
    /* 忽略写入失败：会话退化为内存态 */
  }
}

function safeRemove(area: 'local' | 'session', key: string): void {
  try {
    ;(area === 'local' ? localStorage : sessionStorage).removeItem(key)
  } catch {
    /* 忽略 */
  }
}

/** base64url 解码 token 载荷（只读展示与过期判断用，签名由后端校验） */
function decodePayload(token: string): Record<string, unknown> | null {
  const head = token.split('.')[0]
  if (!head) return null
  const b64 = head.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  try {
    const bin = atob(b64 + pad)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** token 的过期时间（秒级 Unix 时间戳），解析失败返回 null */
export function tokenExp(token: string | null): number | null {
  if (!token) return null
  const p = decodePayload(token)
  const exp = p?.exp
  return typeof exp === 'number' ? exp : null
}

function readStoredToken(): string | null {
  const t = safeGet('local', LS_TOKEN) ?? safeGet('session', SS_TOKEN)
  if (!t) return null
  // 本地先判过期，避免带着死 token 去请求再吃一次 401
  const exp = tokenExp(t)
  if (exp !== null && exp * 1000 <= Date.now()) {
    safeRemove('local', LS_TOKEN)
    safeRemove('session', SS_TOKEN)
    safeRemove('local', LS_USER)
    return null
  }
  return t
}

function readStoredUser(): SessionUser | null {
  const raw = safeGet('local', LS_USER)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

interface AuthState {
  token: string | null
  user: SessionUser | null
  /** 登录成功后保存会话 */
  signIn: (token: string, user: SessionUser, remember: boolean) => void
  /** 局部更新登录人信息（改密后清掉 mustChange） */
  patchUser: (patch: Partial<SessionUser>) => void
  /** 退出登录 / 会话失效 */
  signOut: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  token: readStoredToken(),
  user: readStoredUser(),

  signIn: (token, user, remember) => {
    safeRemove('local', LS_TOKEN)
    safeRemove('session', SS_TOKEN)
    safeSet(remember ? 'local' : 'session', remember ? LS_TOKEN : SS_TOKEN, token)
    safeSet('local', LS_USER, JSON.stringify(user))
    set({ token, user })
  },

  patchUser: (patch) => {
    const user = get().user ? { ...get().user!, ...patch } : null
    if (user) safeSet('local', LS_USER, JSON.stringify(user))
    set({ user })
  },

  signOut: () => {
    safeRemove('local', LS_TOKEN)
    safeRemove('session', SS_TOKEN)
    safeRemove('local', LS_USER)
    set({ token: null, user: null })
  },
}))

/** 当前 token（供 api 层附加 Authorization 头） */
export function getToken(): string | null {
  return useAuth.getState().token
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  sales: '销售部',
  production: '生产部',
  admin: '管理员',
}
