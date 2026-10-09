import type { SavedScheme } from '../types'

const STORAGE_KEY = 'furniture-showroom:scheme'

/** 读取本地保存的方案，失败或不存在返回 null */
export function loadStoredScheme(): SavedScheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedScheme
    if (!parsed || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

/** 保存方案到本地 */
export function storeScheme(scheme: SavedScheme): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheme))
    return true
  } catch {
    return false
  }
}

/** 清除本地方案 */
export function clearStoredScheme(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
}
