import type { RoomConfig, SavedScheme } from '../types'

const STORAGE_KEY = 'furniture-showroom:scheme'
const USER_ROOMS_KEY = 'furniture-showroom:userrooms'

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

/** 读取用户定制房间列表 */
export function loadUserRooms(): RoomConfig[] {
  try {
    const raw = localStorage.getItem(USER_ROOMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RoomConfig[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 保存用户定制房间列表 */
export function storeUserRooms(rooms: RoomConfig[]): boolean {
  try {
    localStorage.setItem(USER_ROOMS_KEY, JSON.stringify(rooms))
    return true
  } catch {
    return false
  }
}
