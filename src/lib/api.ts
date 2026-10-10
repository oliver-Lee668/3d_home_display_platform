// 订单后端 API 客户端（Go + MySQL 服务）
export const API_BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE as string) ||
  'http://localhost:8080'

/** 后端上传资源的相对路径 -> 前端可访问的绝对地址 */
export function resolveAssetUrl(ref: string): string {
  return ref.startsWith('/uploads/') ? API_BASE + ref : ref
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

export interface ApiOrderItem {
  productId: string
  name: string
  qty: number
  materialId: string
  materialLabel: string
  scale: number
  unitPrice: number
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
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, init)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* 忽略 */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => req<{ ok: boolean; storage: string; db: boolean }>('/api/health'),

  createOrder: (payload: CreateOrderPayload) =>
    req<ApiOrder>('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  listOrders: (params?: { status?: string; phone?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.phone) q.set('phone', params.phone)
    const qs = q.toString()
    return req<ApiOrder[]>('/api/orders' + (qs ? `?${qs}` : ''))
  },

  getOrder: (id: number) => req<ApiOrder>(`/api/orders/${id}`),

  updateStatus: (id: number, action: string, by: string, note?: string) =>
    req<ApiOrder>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, by, note }),
    }),

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

  /** 上传模型/图片，返回后端相对路径（/uploads/xxx） */
  uploadFile: async (file: File): Promise<{ url: string; name: string; size: number }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/api/admin/upload`, { method: 'POST', body: fd })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: string }
        if (j.error) msg = j.error
      } catch {
        /* 忽略 */
      }
      throw new Error(msg)
    }
    return (await res.json()) as { url: string; name: string; size: number }
  },
}
