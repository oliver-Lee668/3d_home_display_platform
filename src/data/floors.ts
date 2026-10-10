import type { FloorFinish } from '../types'

/**
 * 地板饰面内置基线（程序化贴图，离线生成）。
 * 销售端可上传新地板或下架内置地板，变更以「目录条目」存后端，
 * 启动时拉取并与本基线合并（见 store/useCatalogStore）。
 */
export const BUILTIN_FLOORS: FloorFinish[] = [
  { id: 'wood-oak', label: '浅橡木', kind: 'wood', baseColor: '#c8a878', swatch: '#c8a878' },
  { id: 'wood-walnut', label: '胡桃木', kind: 'wood', baseColor: '#7a5334', swatch: '#7a5334' },
  { id: 'marble', label: '大理石', kind: 'marble', baseColor: '#e8e6e2', swatch: '#e8e6e2' },
  { id: 'tile', label: '灰瓷砖', kind: 'tile', baseColor: '#b9bcc0', swatch: '#b9bcc0' },
  { id: 'concrete', label: '水泥', kind: 'concrete', baseColor: '#9aa0a6', swatch: '#9aa0a6' },
  { id: 'carpet', label: '米地毯', kind: 'carpet', baseColor: '#d9cbb3', swatch: '#d9cbb3' },
]

export const DEFAULT_FLOOR: FloorFinish = BUILTIN_FLOORS[0]

// ------- 运行时地板（内置基线 + 销售端上传条目合并结果）-------
let RUNTIME: FloorFinish[] = BUILTIN_FLOORS

/** 当前生效的地板列表（UI 订阅请改用 useCatalogStore） */
export function getAllFloors(): FloorFinish[] {
  return RUNTIME
}

/** 由目录同步逻辑调用 */
export function setRuntimeFloors(list: FloorFinish[]): void {
  RUNTIME = list
}

export function getFloorPreset(id: string): FloorFinish | undefined {
  return RUNTIME.find((f) => f.id === id)
}
