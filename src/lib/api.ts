// 订单后端 API 客户端（Go + MySQL 服务）
import { getToken, useAuth } from './auth'

export const API_BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE as string) ||
  'http://localhost:8080'

/** 后端上传资源的相对路径 -> 前端可访问的绝对地址 */
export function resolveAssetUrl(ref: string): string {
  return ref.startsWith('/uploads/') ? API_BASE + ref : ref
}

/** 带状态码的错误，便于 UI 区分 401（会话失效）/ 403（越权）/ 429（限流） */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 目录条目类型：销售端对商品/地板的增删改 */
export type EntryType =
  | 'product_override'
  | 'product_custom'
  | 'product_disable'
  | 'floor_custom'
  | 'floor_disable'

export interface ApiCatalogEntry {
  entryId: string
  type: EntryType
  payload?: unknown
  createdAt: string
  updatedAt: string
}

/** 图纸附件 */
export interface ApiDrawing {
  name: string
  url: string
}

/** 订单行的生产规格快照（与后端 model.ItemSpec 对齐） */
export interface ApiItemSpec {
  sku?: string
  category?: string
  group?: string
  /** 标准外形尺寸（米） */
  baseSizeW: number
  baseSizeH: number
  baseSizeD: number
  /** 定制后实际尺寸（毫米，服务端重算） */
  sizeWmm: number
  sizeHmm: number
  sizeDmm: number
  materialSku?: string
  colorCode?: string
  craft?: string
  packing?: string
  laborMinutes?: number
  scaleMin?: number
  scaleMax?: number
  drawings?: ApiDrawing[]
  /** 带尺寸标注的三视图合成图 dataURL */
  views?: string
}

export interface ApiOrderItem {
  productId: string
  name: string
  qty: number
  materialId: string
  materialLabel: string
  scale: number
  unitPrice: number
  spec?: ApiItemSpec
}

export interface ApiCustomer {
  name: string
  phone: string
  note?: string
}

export interface ApiRoomSnapshot {
  roomId: string
  roomName: string
  sizeW: number
  sizeD: number
  sizeH: number
  floorLabel: string
  snapshot?: string
}

export interface ApiHistoryEntry {
  status: string
  by: string
  at: string
  note?: string
}

export interface ApiOrder {
  id: number
  orderNo: string
  status: string
  customer: ApiCustomer
  room: ApiRoomSnapshot
  items: ApiOrderItem[]
  totalAmount: number
  history: ApiHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateOrderPayload {
  customer: ApiCustomer
  room: ApiRoomSnapshot
  items: ApiOrderItem[]
  totalAmount: number
  /** 图形验证码：下单是公开接口，靠它挡住脚本刷单 */
  captchaId: string
  captchaAnswer: string
}

/** 会话信息（登录后后端下发） */
export interface ApiSessionUser {
  username: string
  role: 'sales' | 'production' | 'admin'
  displayName: string
  mustChange: boolean
}

export interface ApiLoginResp {
  token: string
  expiresAt: number
  user: ApiSessionUser
}

export interface ApiCaptcha {
  id: string
  /** PNG 的 data URL */
  image: string
  expiresIn: number
}

/** 车间报工记录（执行层留痕） */
export interface ApiWorkReport {
  id: number
  orderId: number
  orderNo: string
  itemIndex: number
  itemName: string
  workshop: string
  action: 'start' | 'complete'
  qtyGood: number
  qtyScrap: number
  /** 报工人，后端从 token 取 */
  worker: string
  note?: string
  at: string
}

/** 某个工单行的报工进度 */
export interface ApiReportProgress {
  planned: number
  good: number
  scrap: number
}

export interface ApiWorkshopStat {
  workshop: string
  orders: number
  pieces: number
  good: number
  scrap: number
  progress: number
  laborMinutes: number
}

/** 车间看板读数 */
export interface ApiDashboard {
  inProduction: number
  inProductionPieces: number
  rejected: number
  todayReports: number
  todayGood: number
  todayScrap: number
  todayLaborMinutes: number
  workshops: ApiWorkshopStat[]
  recent: ApiWorkReport[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(API_BASE + path, { ...init, headers })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* 非 JSON 错误体，保留默认文案 */
    }
    // 会话已死：清本地登录态，UI 会自动回到登录页
    if (res.status === 401 && token) useAuth.getState().signOut()
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => req<{ ok: boolean; storage: string; db: boolean }>('/api/health'),

  // ------- 员工会话 -------
  login: (username: string, password: string) =>
    req<ApiLoginResp>('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

  me: () =>
    req<{ user: ApiSessionUser; roleLabel: string; expiresAt: number }>('/api/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  // ------- 下单防刷 -------
  captcha: () => req<ApiCaptcha>('/api/captcha'),

  createOrder: (payload: CreateOrderPayload) =>
    req<ApiOrder>('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** 员工：全量/按状态拉订单 */
  listOrders: (params?: { status?: string; phone?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.phone) q.set('phone', params.phone)
    const qs = q.toString()
    return req<ApiOrder[]>('/api/orders' + (qs ? `?${qs}` : ''))
  },

  /** 客户：订单号 + 手机号双因子自助查单 */
  lookupOrders: (orderNo: string, phone: string) =>
    req<ApiOrder[]>(
      `/api/orders/lookup?orderNo=${encodeURIComponent(orderNo)}&phone=${encodeURIComponent(phone)}`,
    ),

  getOrder: (id: number) => req<ApiOrder>(`/api/orders/${id}`),

  /** 状态流转：操作人由后端从 token 取，前端不再传 by */
  updateStatus: (id: number, action: string, note?: string) =>
    req<ApiOrder>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    }),

  // ------- 车间执行层（报工 / 看板）-------
  addReport: (payload: {
    orderId: number
    itemIndex: number
    action: 'start' | 'complete'
    qtyGood?: number
    qtyScrap?: number
    note?: string
  }) =>
    req<{ report: ApiWorkReport; progress: ApiReportProgress }>('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  listReports: (orderId: number) => req<ApiWorkReport[]>(`/api/reports?orderId=${orderId}`),

  dashboard: () => req<ApiDashboard>('/api/dashboard'),

  // ------- 目录（商品/地板）-------
  listEntries: () => req<ApiCatalogEntry[]>('/api/entries'),

  upsertEntry: (entryId: string, type: EntryType, payload?: unknown) =>
    req<ApiCatalogEntry>(`/api/admin/entries/${encodeURIComponent(entryId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    }),

  deleteEntry: (entryId: string) =>
    req<{ ok: boolean }>(`/api/admin/entries/${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
    }),

  /** 上传模型/图片/图纸，返回后端相对路径（/uploads/xxx） */
  uploadFile: async (file: File): Promise<{ url: string; name: string; size: number }> => {
    const fd = new FormData()
    fd.append('file', file)
    const headers = new Headers()
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${API_BASE}/api/admin/upload`, { method: 'POST', headers, body: fd })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: string }
        if (j.error) msg = j.error
      } catch {
        /* 忽略 */
      }
      if (res.status === 401 && token) useAuth.getState().signOut()
      throw new ApiError(res.status, msg)
    }
    return (await res.json()) as { url: string; name: string; size: number }
  },

  /**
   * 下载图纸类附件。图纸受鉴权保护，<a download> 不会带 Authorization 头，
   * 因此这里用 fetch 拿到 blob 再触发下载。
   */
  downloadDrawing: async (ref: string, filename: string): Promise<void> => {
    const headers = new Headers()
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(resolveAssetUrl(ref), { headers })
    if (!res.ok) {
      if (res.status === 401 && token) useAuth.getState().signOut()
      throw new ApiError(res.status, res.status === 401 ? '登录已失效，请重新登录后下载' : `下载失败 HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || ref.split('/').pop() || 'drawing'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 给浏览器一点时间开始下载再释放
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  },
}
