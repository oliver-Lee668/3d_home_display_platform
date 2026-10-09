import { create } from 'zustand'
import type { PlacedItem, TransformMode, ViewMode } from '../types'
import { getProduct } from '../data/catalog'
import { getRoom, ROOMS } from '../data/rooms'
import { loadStoredScheme, storeScheme, clearStoredScheme } from '../lib/storage'
import { findFreeSpot, footprint } from '../lib/placement'

let instanceSeq = 0
function nextInstanceId(): string {
  instanceSeq += 1
  return `it_${Date.now().toString(36)}_${instanceSeq}`
}

interface SceneState {
  roomId: string
  items: PlacedItem[]
  selectedId: string | null
  viewMode: ViewMode
  transformMode: TransformMode
  /** 是否显示地面网格辅助线 */
  showGrid: boolean
  /** 顶部提示消息 */
  message: string | null
  /** 是否存在已保存方案（用于按钮可用性） */
  hasSaved: boolean

  // actions
  addItem: (productId: string) => void
  updateItem: (instanceId: string, patch: Partial<PlacedItem>) => void
  removeItem: (instanceId: string) => void
  duplicateItem: (instanceId: string) => void
  select: (instanceId: string | null) => void
  setRoom: (roomId: string) => void
  setViewMode: (mode: ViewMode) => void
  setTransformMode: (mode: TransformMode) => void
  toggleGrid: () => void
  resetScene: () => void
  saveScheme: () => void
  loadScheme: () => void
  /** 首次进入时加载一套客厅示例布局 */
  loadStarter: () => void
  notify: (msg: string) => void
  clearMessage: () => void
}

/** 计算新物品的初始落点：自动寻找不与现有物品重叠的空位；房间拥挤时回退到重叠最小处 */
function computeSpawnPosition(
  roomId: string,
  items: PlacedItem[],
  productId: string,
): { position: [number, number, number]; free: boolean } {
  const room = getRoom(roomId)
  const product = getProduct(productId)
  if (!product) return { position: [0, 0, 0], free: true }
  const f = footprint(product, 1)
  const spot = findFreeSpot(room.size, items, f.hw, f.hd, getProduct)
  return { position: [spot.x, 0, spot.z], free: spot.free }
}

export const useSceneStore = create<SceneState>((set, get) => ({
  roomId: ROOMS[0].id,
  items: [],
  selectedId: null,
  viewMode: 'orbit',
  transformMode: 'translate',
  showGrid: false,
  message: null,
  hasSaved: loadStoredScheme() !== null,

  addItem: (productId) => {
    const product = getProduct(productId)
    if (!product) return
    const { items, roomId } = get()
    const { position, free } = computeSpawnPosition(roomId, items, productId)
    const item: PlacedItem = {
      instanceId: nextInstanceId(),
      productId,
      position,
      rotationY: 0,
      scale: 1,
      materialId: product.defaultMaterialId,
    }
    set({ items: [...items, item], selectedId: item.instanceId })
    get().notify(
      free
        ? `已添加「${product.name}」`
        : `已添加「${product.name}」，房间空间不足，请拖拽调整位置`,
    )
  },

  updateItem: (instanceId, patch) => {
    set({
      items: get().items.map((it) =>
        it.instanceId === instanceId ? { ...it, ...patch } : it,
      ),
    })
  },

  removeItem: (instanceId) => {
    const items = get().items.filter((it) => it.instanceId !== instanceId)
    set({
      items,
      selectedId: get().selectedId === instanceId ? null : get().selectedId,
    })
  },

  duplicateItem: (instanceId) => {
    const src = get().items.find((it) => it.instanceId === instanceId)
    if (!src) return
    const copy: PlacedItem = {
      ...src,
      instanceId: nextInstanceId(),
      position: [src.position[0] + 0.4, 0, src.position[2] + 0.4],
    }
    set({ items: [...get().items, copy], selectedId: copy.instanceId })
  },

  select: (instanceId) => set({ selectedId: instanceId }),

  setRoom: (roomId) => {
    // 切换房间时清空已放置物品并取消选中，避免越界
    set({ roomId, items: [], selectedId: null })
    get().notify(`已切换到「${getRoom(roomId).name}」`)
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),

  resetScene: () => {
    set({ items: [], selectedId: null })
    get().notify('场景已清空')
  },

  saveScheme: () => {
    const { roomId, items } = get()
    const ok = storeScheme({
      name: `${getRoom(roomId).name}方案`,
      roomId,
      items,
      savedAt: Date.now(),
    })
    set({ hasSaved: ok })
    get().notify(ok ? '方案已保存到本地' : '保存失败')
  },

  loadScheme: () => {
    const scheme = loadStoredScheme()
    if (!scheme) {
      get().notify('没有可加载的方案')
      return
    }
    set({
      roomId: scheme.roomId,
      items: scheme.items,
      selectedId: null,
    })
    get().notify('方案已加载')
  },

  loadStarter: () => {
    const mk = (
      productId: string,
      position: [number, number, number],
      rotationY: number,
      materialId: string,
      scale = 1,
    ): PlacedItem => ({
      instanceId: nextInstanceId(),
      productId,
      position,
      rotationY,
      scale,
      materialId,
    })
    set({
      roomId: 'living',
      selectedId: null,
      items: [
        mk('rug', [0, 0, 0.15], 0, 'grey'),
        mk('sofa-3p', [0, 0, -1.5], 0, 'grey'),
        mk('coffee-table', [0, 0, 0.15], 0, 'wood'),
        mk('tv-stand', [0, 0, 2.0], Math.PI, 'white-oak'),
        mk('tv-55', [0, 0, 2.0], Math.PI, 'black'),
        mk('armchair', [-1.95, 0, 0.55], Math.PI / 3.2, 'olive'),
        mk('plant', [2.3, 0, -1.7], 0, 'green'),
        mk('floor-lamp', [-2.35, 0, -1.7], 0, 'warm'),
      ],
    })
  },

  notify: (msg) => {
    set({ message: msg })
    // 自动清除
    window.setTimeout(() => {
      if (get().message === msg) set({ message: null })
    }, 2200)
  },

  clearMessage: () => set({ message: null }),
}))

/** 便捷：清空本地方案（供设置/调试用） */
export function clearPersistedScheme() {
  clearStoredScheme()
  useSceneStore.setState({ hasSaved: false })
}
