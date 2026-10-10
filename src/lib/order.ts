import { getProduct } from '../data/catalog'
import { getRoom } from '../data/rooms'
import { useSceneStore } from '../store/useSceneStore'
import { captureScene } from './screenshot'
import type { ApiOrderItem, CreateOrderPayload } from './api'

/** 订单状态中文（与后端 model.StatusLabel 对齐） */
export const STATUS_LABEL: Record<string, string> = {
  submitted: '已下单·待销售确认',
  sales_confirmed: '销售已确认·待生产确认',
  in_production: '生产中',
  completed: '已完成',
}

export function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s
}

/** 状态对应色（徽章用） */
export function statusColor(s: string): string {
  switch (s) {
    case 'submitted':
      return '#f59e0b'
    case 'sales_confirmed':
      return '#3b82f6'
    case 'in_production':
      return '#8b5cf6'
    case 'completed':
      return '#10b981'
    default:
      return '#94a3b8'
  }
}

/** 把当前场景已摆放物品聚合为订单行（同商品+材质+缩放合并计数） */
export function buildOrderLines(): ApiOrderItem[] {
  const items = useSceneStore.getState().items
  const map = new Map<string, ApiOrderItem>()
  for (const it of items) {
    const product = getProduct(it.productId)
    if (!product) continue
    const key = `${it.productId}|${it.materialId}|${it.scale}`
    const prev = map.get(key)
    if (prev) {
      prev.qty += 1
      continue
    }
    map.set(key, {
      productId: product.id,
      name: product.name,
      qty: 1,
      materialId: it.materialId,
      materialLabel: product.materials.find((m) => m.id === it.materialId)?.label ?? it.materialId,
      scale: it.scale,
      unitPrice: product.price ?? 0,
    })
  }
  return [...map.values()]
}

export function linesTotal(lines: ApiOrderItem[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
}

/** 将 dataURL 缩放到最长边不超过 max，压缩订单快照体积 */
export function shrinkDataUrl(dataUrl: string, max = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onerror = () => resolve(dataUrl)
    img.onload = () => {
      if (img.width <= max) return resolve(dataUrl)
      const scale = max / img.width
      const c = document.createElement('canvas')
      c.width = max
      c.height = Math.max(1, Math.round(img.height * scale))
      const ctx = c.getContext('2d')
      if (!ctx) return resolve(dataUrl)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

/** 组装下单请求体（含房间尺寸/地板/3D 快照） */
export async function buildOrderPayload(
  customer: { name: string; phone: string; note?: string },
): Promise<CreateOrderPayload> {
  const s = useSceneStore.getState()
  const room = getRoom(s.roomId)
  const lines = buildOrderLines()
  const raw = captureScene()
  const snapshot = raw ? await shrinkDataUrl(raw, 1024) : undefined
  return {
    customer,
    room: {
      roomId: room.id,
      roomName: room.name,
      sizeW: room.size.w,
      sizeD: room.size.d,
      sizeH: room.size.height,
      floorLabel: s.floor.label,
      snapshot,
    },
    items: lines,
    totalAmount: linesTotal(lines),
  }
}

const LAST_PHONE_KEY = 'furniture-showroom:lastPhone'

export function getLastPhone(): string {
  try {
    return localStorage.getItem(LAST_PHONE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setLastPhone(phone: string): void {
  try {
    localStorage.setItem(LAST_PHONE_KEY, phone)
  } catch {
    /* 忽略 */
  }
}
