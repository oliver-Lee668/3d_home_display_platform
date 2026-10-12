import { CATEGORY_META, getProduct } from '../data/catalog'
import { getRoom } from '../data/rooms'
import { useSceneStore } from '../store/useSceneStore'
import { captureScene } from './screenshot'
import { makeThreeViewDataUrl } from './views'
import type { ApiOrder, ApiItemSpec, ApiOrderItem, CreateOrderPayload } from './api'
import type { Product } from '../types'

/** 订单状态中文（与后端 model.StatusLabel 对齐） */
export const STATUS_LABEL: Record<string, string> = {
  submitted: '已下单·待销售确认',
  sales_confirmed: '销售已确认·待生产确认',
  in_production: '生产中',
  completed: '已完成',
  rejected: '已退回·待销售处理',
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
    case 'rejected':
      return '#ef4444'
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
      // 下单瞬间冻结规格快照（生产依据，不受销售事后改目录影响）
      spec: buildItemSpec(product, it.materialId, it.scale),
    })
  }
  const lines = [...map.values()]
  // 三视图在数量确定后生成（标题栏需显示件数）
  for (const l of lines) {
    const spec = l.spec
    if (!spec) continue
    spec.views = makeThreeViewDataUrl({
      name: l.name,
      sku: spec.sku,
      material: l.materialLabel,
      colorCode: spec.colorCode,
      qty: l.qty,
      scale: l.scale,
      sizeMm: { w: spec.sizeWmm, h: spec.sizeHmm, d: spec.sizeDmm },
      craft: spec.craft,
      packing: spec.packing,
      laborMinutes: spec.laborMinutes,
    })
  }
  return lines
}

/** 米转毫米（四舍五入） */
function toMM(meters: number, scale: number): number {
  return Math.round(meters * scale * 1000)
}

/** 根据商品与定制参数构造规格快照 */
export function buildItemSpec(product: Product, materialId: string, scale: number): ApiItemSpec {
  const spec = product.spec
  const mat = product.materials.find((m) => m.id === materialId)
  return {
    sku: spec?.sku ?? '',
    category: CATEGORY_META[product.category]?.label ?? product.category,
    group: CATEGORY_META[product.category]?.group ?? '其他',
    baseSizeW: product.size.w,
    baseSizeH: product.size.h,
    baseSizeD: product.size.d,
    sizeWmm: toMM(product.size.w, scale),
    sizeHmm: toMM(product.size.h, scale),
    sizeDmm: toMM(product.size.d, scale),
    materialSku: spec?.materialSku,
    colorCode: mat?.color,
    craft: spec?.craft,
    packing: spec?.packing,
    laborMinutes: spec?.laborMinutes,
    scaleMin: spec?.scaleMin,
    scaleMax: spec?.scaleMax,
    // 图纸保留后端相对路径，展示时再 resolveAssetUrl，避免写死部署地址
    drawings: (spec?.drawings ?? []).map((d) => ({ name: d.name, url: d.url })),
  }
}

/** 超出工艺可行域的定制项（下单前前置提示；后端仍会再次校验） */
export function scaleIssues(items: ApiOrderItem[]) {
  const out: { name: string; scale: number; min?: number; max?: number }[] = []
  for (const it of items) {
    const s = it.spec
    if (!s) continue
    if ((s.scaleMin && it.scale < s.scaleMin - 1e-6) || (s.scaleMax && it.scale > s.scaleMax + 1e-6)) {
      out.push({ name: it.name, scale: it.scale, min: s.scaleMin, max: s.scaleMax })
    }
  }
  return out
}

export function linesTotal(lines: ApiOrderItem[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
}

// ------- 生产工单：拆单分组与导出 -------

/** 车间拆单分组 */
export interface WorkOrderGroup {
  group: string
  items: ApiOrderItem[]
  pieces: number
  laborMinutes: number
  amount: number
}

const GROUP_ORDER = ['家具', '家电', '软装', '其他']

/** 按车间分组拆单，并汇总件数/工时/金额 */
export function groupWorkOrder(items: ApiOrderItem[]): WorkOrderGroup[] {
  const m = new Map<string, WorkOrderGroup>()
  for (const it of items) {
    const g = it.spec?.group || '其他'
    let grp = m.get(g)
    if (!grp) {
      grp = { group: g, items: [], pieces: 0, laborMinutes: 0, amount: 0 }
      m.set(g, grp)
    }
    grp.items.push(it)
    grp.pieces += it.qty
    grp.laborMinutes += (it.spec?.laborMinutes ?? 0) * it.qty
    grp.amount += it.unitPrice * it.qty
  }
  return [...m.values()].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
}

export function workOrderTotals(items: ApiOrderItem[]): {
  lines: number
  pieces: number
  laborMinutes: number
} {
  let pieces = 0
  let laborMinutes = 0
  for (const it of items) {
    pieces += it.qty
    laborMinutes += (it.spec?.laborMinutes ?? 0) * it.qty
  }
  return { lines: items.length, pieces, laborMinutes }
}

/** 分钟 → 可读工时 */
export function laborText(minutes: number): string {
  if (!minutes) return '—'
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)} 小时` : `${minutes} 分钟`
}

/** 定制后实际外形尺寸（宽 × 深 × 高，毫米） */
export function sizeText(it: ApiOrderItem): string {
  const s = it.spec
  if (!s || !s.sizeWmm) return '未提供'
  return `${s.sizeWmm} × ${s.sizeDmm} × ${s.sizeHmm}`
}

const csvCell = (v: unknown) =>
  `"${String(v ?? '')
    .replace(/"/g, '""')
    .replace(/[\r\n]+/g, ' ')}"`

/** 导出生产工单 CSV（按拆单分组，含规格/工时/金额） */
export function orderToCsv(order: ApiOrder): string {
  const head = [
    '车间',
    '分类',
    '商品名称',
    '型号SKU',
    '数量',
    '实际宽(mm)',
    '实际深(mm)',
    '实际高(mm)',
    '材质',
    '色号',
    '主材SKU',
    '工艺要求',
    '包装规格',
    '单件工时(分)',
    '小计工时(分)',
    '图纸数',
    '缩放',
    '单价',
    '金额',
  ]
  const rows: string[] = [head.map(csvCell).join(',')]
  for (const g of groupWorkOrder(order.items)) {
    for (const it of g.items) {
      const s = it.spec
      rows.push(
        [
          g.group,
          s?.category ?? '',
          it.name,
          s?.sku ?? '',
          it.qty,
          s?.sizeWmm ?? '',
          s?.sizeDmm ?? '',
          s?.sizeHmm ?? '',
          it.materialLabel,
          s?.colorCode ?? '',
          s?.materialSku ?? '',
          s?.craft ?? '',
          s?.packing ?? '',
          s?.laborMinutes ?? 0,
          (s?.laborMinutes ?? 0) * it.qty,
          s?.drawings?.length ?? 0,
          it.scale,
          it.unitPrice,
          it.unitPrice * it.qty,
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  const t = workOrderTotals(order.items)
  rows.push(
    [
      `合计 ${order.orderNo}`,
      '',
      '',
      '',
      t.pieces,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      t.laborMinutes,
      '',
      '',
      '',
      order.totalAmount,
    ]
      .map(csvCell)
      .join(','),
  )
  return rows.join('\r\n')
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
