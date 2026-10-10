import type { FloorFinish } from '../types'

/** 地板饰面预设（程序化贴图，离线生成） */
export const FLOOR_PRESETS: FloorFinish[] = [
  { id: 'wood-oak', label: '浅橡木', kind: 'wood', baseColor: '#c8a878', swatch: '#c8a878' },
  { id: 'wood-walnut', label: '胡桃木', kind: 'wood', baseColor: '#7a5334', swatch: '#7a5334' },
  { id: 'marble', label: '大理石', kind: 'marble', baseColor: '#e8e6e2', swatch: '#e8e6e2' },
  { id: 'tile', label: '灰瓷砖', kind: 'tile', baseColor: '#b9bcc0', swatch: '#b9bcc0' },
  { id: 'concrete', label: '水泥', kind: 'concrete', baseColor: '#9aa0a6', swatch: '#9aa0a6' },
  { id: 'carpet', label: '米地毯', kind: 'carpet', baseColor: '#d9cbb3', swatch: '#d9cbb3' },
]

export const DEFAULT_FLOOR: FloorFinish = FLOOR_PRESETS[0]

export function getFloorPreset(id: string): FloorFinish | undefined {
  return FLOOR_PRESETS.find((f) => f.id === id)
}
