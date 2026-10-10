import type { RoomConfig } from '../types'
import { loadUserRooms, storeUserRooms } from '../lib/storage'

/**
 * 预设样板间。
 * 坐标约定：房间中心位于原点 (0,0,0)，地面 y=0。
 * 墙：north=−z，south=+z，west=−x，east=+x。
 */
export const ROOMS: RoomConfig[] = [
  {
    id: 'living',
    name: '客厅',
    size: { w: 6.0, d: 5.0, height: 2.8 },
    floorColor: '#c9a882',
    wallColor: '#f2efe9',
    ceilingColor: '#fbfaf7',
    openings: [
      // 南面(+z)大窗
      { wall: 'south', offset: 0, width: 2.6, height: 1.5, sill: 0.7, type: 'window' },
      // 东面(+x)入户门
      { wall: 'east', offset: -1.2, width: 0.95, height: 2.05, sill: 0, type: 'door' },
    ],
  },
  {
    id: 'bedroom',
    name: '卧室',
    size: { w: 4.6, d: 4.2, height: 2.7 },
    floorColor: '#d7bd98',
    wallColor: '#eef0ea',
    ceilingColor: '#fbfaf7',
    openings: [
      // 北面(−z)窗
      { wall: 'north', offset: 0.3, width: 1.8, height: 1.4, sill: 0.8, type: 'window' },
      // 西面(−x)门
      { wall: 'west', offset: 1.0, width: 0.9, height: 2.05, sill: 0, type: 'door' },
    ],
  },
]

export const ROOM_MAP: Record<string, RoomConfig> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
)

/** 用户定制房间（内存注册表 + localStorage 持久化） */
let userRooms: RoomConfig[] = loadUserRooms()

export function getUserRooms(): RoomConfig[] {
  return userRooms
}

/** 预设 + 用户房间合并列表（供房间切换器） */
export function getAllRooms(): RoomConfig[] {
  return [...ROOMS, ...userRooms]
}

export function addUserRoom(cfg: RoomConfig): void {
  userRooms = [...userRooms, cfg]
  storeUserRooms(userRooms)
}

export function removeUserRoom(id: string): void {
  userRooms = userRooms.filter((r) => r.id !== id)
  storeUserRooms(userRooms)
}

export function getRoom(id: string): RoomConfig {
  return ROOM_MAP[id] ?? userRooms.find((r) => r.id === id) ?? ROOMS[0]
}
