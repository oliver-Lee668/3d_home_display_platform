import type { PlacedItem, Product } from '../types'

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 缩放范围 */
export const SCALE_MIN = 0.5
export const SCALE_MAX = 2

/** 物品在 XZ 平面的半宽/半深（忽略旋转，MVP 简化碰撞） */
export function footprint(product: Product, scale: number): { hw: number; hd: number } {
  return { hw: (product.size.w * scale) / 2, hd: (product.size.d * scale) / 2 }
}

/** 将位置钳制在房间地面范围内 */
export function clampToRoom(
  x: number,
  z: number,
  hw: number,
  hd: number,
  roomSize: { w: number; d: number },
): { x: number; z: number } {
  const maxX = Math.max(0, roomSize.w / 2 - hw)
  const maxZ = Math.max(0, roomSize.d / 2 - hd)
  return { x: clamp(x, -maxX, maxX), z: clamp(z, -maxZ, maxZ) }
}

/**
 * 为新物品寻找落点。
 * 从 center（默认偏右前，避开左侧商品库遮挡）开始螺旋向外搜索：
 * - 若找到完全不重叠的空位，立即返回（free=true）；
 * - 若房间拥挤、遍历完仍无完全空位，返回"与其它物品重叠面积最小"的 best-effort
 *   落点（free=false），避免直接落在会穿模的中心点。调用方可据此提示用户手动调整。
 */
export function findFreeSpot(
  roomSize: { w: number; d: number },
  items: PlacedItem[],
  hw: number,
  hd: number,
  productOf: (productId: string) => Product | undefined,
  center: [number, number] = [0.6, 0.3],
): { x: number; z: number; free: boolean } {
  const maxR = Math.max(roomSize.w, roomSize.d)
  let best = { x: center[0], z: center[1], area: Infinity }
  for (let r = 0; r <= maxR; r += 0.35) {
    const steps = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / 0.35))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const x = center[0] + Math.cos(a) * r
      const z = center[1] + Math.sin(a) * r
      const c = clampToRoom(x, z, hw, hd, roomSize)
      const area = overlapArea('__spawn__', c.x, c.z, hw, hd, items, productOf)
      if (area === 0) {
        // 完全空位（面积 0 等价于不与任何物品重叠），直接使用
        return { x: Number(c.x.toFixed(2)), z: Number(c.z.toFixed(2)), free: true }
      }
      if (area < best.area) best = { x: c.x, z: c.z, area }
    }
  }
  // 房间拥挤、无完全空位：返回重叠面积最小的落点
  return { x: Number(best.x.toFixed(2)), z: Number(best.z.toFixed(2)), free: false }
}

/** 两个 XZ 轴对齐矩形是否重叠 */
function overlaps(
  ax: number,
  az: number,
  ahw: number,
  ahd: number,
  bx: number,
  bz: number,
  bhw: number,
  bhd: number,
): boolean {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(az - bz) < ahd + bhd
}

/** 高度低于此阈值的物品（如地毯）视为地面薄片，不参与碰撞 */
export const FLAT_HEIGHT = 0.06

export function isFlat(product: Product): boolean {
  return product.size.h < FLAT_HEIGHT
}

/**
 * 判断某物品在候选位置是否与其它物品碰撞。
 * @param self 当前物品实例 id（排除自身）
 */
export function collides(
  self: string,
  x: number,
  z: number,
  hw: number,
  hd: number,
  items: PlacedItem[],
  productOf: (productId: string) => Product | undefined,
): boolean {
  for (const it of items) {
    if (it.instanceId === self) continue
    const p = productOf(it.productId)
    if (!p) continue
    if (isFlat(p)) continue // 地毯等不阻挡
    const f = footprint(p, it.scale)
    if (overlaps(x, z, hw, hd, it.position[0], it.position[2], f.hw, f.hd)) return true
  }
  return false
}

/**
 * 计算某位置与其它非 flat 物品的重叠面积之和（平方米）。
 * 返回 0 表示完全不重叠（等价于 collides===false）；用于拥挤房间的 best-effort 落点排序。
 */
function overlapArea(
  self: string,
  x: number,
  z: number,
  hw: number,
  hd: number,
  items: PlacedItem[],
  productOf: (productId: string) => Product | undefined,
): number {
  let total = 0
  for (const it of items) {
    if (it.instanceId === self) continue
    const p = productOf(it.productId)
    if (!p) continue
    if (isFlat(p)) continue // 地毯等不阻挡
    const f = footprint(p, it.scale)
    const ox = Math.max(0, hw + f.hw - Math.abs(x - it.position[0]))
    const oz = Math.max(0, hd + f.hd - Math.abs(z - it.position[2]))
    total += ox * oz
  }
  return total
}
