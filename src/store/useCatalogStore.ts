import { create } from 'zustand'
import type { FloorFinish, Product } from '../types'
import { api, resolveAssetUrl } from '../lib/api'
import type { ApiCatalogEntry, EntryType } from '../lib/api'
import { BUILTIN_CATALOG, setRuntimeProducts } from '../data/catalog'
import { BUILTIN_FLOORS, setRuntimeFloors } from '../data/floors'

/** 条目 id 约定：同一商品可同时存在 override 与 disable */
export const entryIds = {
  productOverride: (id: string) => `po_${id}`,
  productCustom: (id: string) => `pc_${id}`,
  productDisable: (id: string) => `pd_${id}`,
  floorCustom: (id: string) => `fc_${id}`,
  floorDisable: (id: string) => `fd_${id}`,
}

/** 上传模型的商品：把后端相对路径解析成可访问的绝对地址 */
function resolveProduct(p: Product): Product {
  if (p.model.kind === 'gltf') {
    return { ...p, model: { kind: 'gltf', ref: resolveAssetUrl(p.model.ref) } }
  }
  return p
}

function resolveFloor(f: FloorFinish): FloorFinish {
  return f.image ? { ...f, image: resolveAssetUrl(f.image) } : f
}

export interface MergedCatalog {
  products: Product[]
  floors: FloorFinish[]
  overriddenProducts: string[]
  customProducts: string[]
  disabledProducts: string[]
  customFloors: string[]
  disabledFloors: string[]
}

/** 把后端目录条目叠加到内置基线上 */
export function mergeEntries(entries: ApiCatalogEntry[]): MergedCatalog {
  const base = new Map(BUILTIN_CATALOG.map((p) => [p.id, p]))
  const overridden: string[] = []
  const customProducts: string[] = []
  const disabledProducts: string[] = []

  // 先应用覆盖，再新增自定义，最后下架
  for (const e of entries) {
    if (e.type === 'product_override') {
      const patch = (e.payload ?? {}) as Partial<Product> & { id?: string }
      const id = patch.id ?? e.entryId.replace(/^po_/, '')
      const prev = base.get(id)
      if (!prev) continue
      base.set(id, { ...prev, ...patch, id } as Product)
      overridden.push(id)
    } else if (e.type === 'product_custom') {
      const p = e.payload as Product | undefined
      if (!p?.id) continue
      base.set(p.id, p)
      customProducts.push(p.id)
    } else if (e.type === 'product_disable') {
      disabledProducts.push(e.entryId.replace(/^pd_/, ''))
    }
  }
  for (const id of disabledProducts) base.delete(id)

  let floors = [...BUILTIN_FLOORS]
  const customFloors: string[] = []
  const disabledFloors: string[] = []
  for (const e of entries) {
    if (e.type === 'floor_custom') {
      const f = e.payload as FloorFinish | undefined
      if (!f?.id) continue
      floors.push(f)
      customFloors.push(f.id)
    } else if (e.type === 'floor_disable') {
      disabledFloors.push(e.entryId.replace(/^fd_/, ''))
    }
  }
  floors = floors.filter((f) => !disabledFloors.includes(f.id))

  return {
    products: [...base.values()].map(resolveProduct),
    floors: floors.map(resolveFloor),
    overriddenProducts: overridden,
    customProducts,
    disabledProducts,
    customFloors,
    disabledFloors,
  }
}

interface CatalogState extends MergedCatalog {
  entries: ApiCatalogEntry[]
  loaded: boolean
  error: string | null
  busy: string | null
  /** 拉取后端条目并与内置基线合并（失败则保持内置基线，可离线使用） */
  refresh: () => Promise<void>
  /** 新增/覆盖条目后自动刷新 */
  saveEntry: (entryId: string, type: EntryType, payload?: unknown) => Promise<void>
  removeEntry: (entryId: string) => Promise<void>
  /** 上传文件，返回后端相对路径（如 /uploads/xxx.glb） */
  upload: (file: File) => Promise<string>
}

const EMPTY: MergedCatalog = {
  products: BUILTIN_CATALOG,
  floors: BUILTIN_FLOORS,
  overriddenProducts: [],
  customProducts: [],
  disabledProducts: [],
  customFloors: [],
  disabledFloors: [],
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  ...EMPTY,
  entries: [],
  loaded: false,
  error: null,
  busy: null,

  refresh: async () => {
    try {
      const entries = await api.listEntries()
      const merged = mergeEntries(entries)
      setRuntimeProducts(merged.products)
      setRuntimeFloors(merged.floors)
      set({ entries, ...merged, loaded: true, error: null })
    } catch (e) {
      // 后端不可用时保持内置基线，不影响展示端使用
      setRuntimeProducts(EMPTY.products)
      setRuntimeFloors(EMPTY.floors)
      set({ loaded: true, error: e instanceof Error ? e.message : '目录加载失败' })
    }
  },

  saveEntry: async (entryId, type, payload) => {
    set({ busy: entryId })
    try {
      await api.upsertEntry(entryId, type, payload)
      await get().refresh()
    } finally {
      set({ busy: null })
    }
  },

  removeEntry: async (entryId) => {
    set({ busy: entryId })
    try {
      await api.deleteEntry(entryId)
      await get().refresh()
    } finally {
      set({ busy: null })
    }
  },

  upload: async (file) => {
    const res = await api.uploadFile(file)
    return res.url
  },
}))
