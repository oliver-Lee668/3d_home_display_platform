import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { RoomConfig, WallOpening } from '../types'

const WALL_T = 0.08 // 墙厚（用于门框/窗框进深）
const FRAME_COLOR = '#e9e6e0'
const BASEBOARD_COLOR = '#f6f4f0'
const GLASS_COLOR = '#bcd7e6'

/** 用带洞的 Shape 生成一面墙的平面几何（局部 XY：x=沿墙长度，y=高度） */
function makeWallGeometry(length: number, height: number, openings: WallOpening[]): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-length / 2, 0)
  shape.lineTo(length / 2, 0)
  shape.lineTo(length / 2, height)
  shape.lineTo(-length / 2, height)
  shape.lineTo(-length / 2, 0)

  for (const o of openings) {
    const x0 = o.offset - o.width / 2
    const x1 = o.offset + o.width / 2
    const y0 = Math.max(0, o.sill)
    const y1 = Math.min(height, o.sill + o.height)
    if (x1 <= x0 || y1 <= y0) continue
    const hole = new THREE.Path()
    hole.moveTo(x0, y0)
    hole.lineTo(x1, y0)
    hole.lineTo(x1, y1)
    hole.lineTo(x0, y1)
    hole.lineTo(x0, y0)
    shape.holes.push(hole)
  }

  const geo = new THREE.ShapeGeometry(shape)
  geo.computeVertexNormals()
  return geo
}

/** 单个墙面（含洞口、门窗框、玻璃、踢脚线），法线朝房间内 */
function Wall({
  length,
  height,
  openings,
  position,
  rotationY,
  color,
}: {
  length: number
  height: number
  openings: WallOpening[]
  position: [number, number, number]
  rotationY: number
  color: string
}) {
  const geometry = useMemo(() => makeWallGeometry(length, height, openings), [length, height, openings])
  useEffect(() => () => geometry.dispose(), [geometry])

  const hasDoor = openings.some((o) => o.type === 'door')

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 墙面（单面朝内，从外部看被剔除 -> 娃娃屋透视） */}
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.96} metalness={0} side={THREE.FrontSide} />
      </mesh>

      {/* 踢脚线（有门的墙跳过，避免横穿门口） */}
      {!hasDoor && (
        <mesh position={[0, 0.05, 0.012]}>
          <boxGeometry args={[length, 0.1, 0.02]} />
          <meshStandardMaterial color={BASEBOARD_COLOR} roughness={0.8} />
        </mesh>
      )}

      {/* 门窗框 + 玻璃 */}
      {openings.map((o, i) => (
        <Opening key={i} o={o} />
      ))}
    </group>
  )
}

/** 门/窗洞口装饰：四周框 + 窗玻璃 */
function Opening({ o }: { o: WallOpening }) {
  const cx = o.offset
  const cy = o.sill + o.height / 2
  const fw = 0.05 // 框宽
  const fd = WALL_T // 框进深
  const isWindow = o.type === 'window'

  return (
    <group>
      {/* 上框 */}
      <mesh position={[cx, o.sill + o.height + fw / 2, 0]}>
        <boxGeometry args={[o.width + fw * 2, fw, fd]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>
      {/* 下框（窗台；门则省略） */}
      {isWindow && (
        <mesh position={[cx, o.sill - fw / 2, 0]}>
          <boxGeometry args={[o.width + fw * 2, fw, fd + 0.04]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
        </mesh>
      )}
      {/* 左框 */}
      <mesh position={[cx - o.width / 2 - fw / 2, cy, 0]}>
        <boxGeometry args={[fw, o.height, fd]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>
      {/* 右框 */}
      <mesh position={[cx + o.width / 2 + fw / 2, cy, 0]}>
        <boxGeometry args={[fw, o.height, fd]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>
      {/* 玻璃（仅窗） */}
      {isWindow && (
        <mesh position={[cx, cy, 0]}>
          <planeGeometry args={[o.width, o.height]} />
          <meshStandardMaterial
            color={GLASS_COLOR}
            transparent
            opacity={0.28}
            roughness={0.08}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  )
}

/** 预设房间：地板 + 天花 + 四面墙 */
export function Room({ room }: { room: RoomConfig }) {
  const { w, d, height } = room.size

  const northOpenings = room.openings.filter((o) => o.wall === 'north')
  const southOpenings = room.openings.filter((o) => o.wall === 'south')
  const westOpenings = room.openings.filter((o) => o.wall === 'west')
  const eastOpenings = room.openings.filter((o) => o.wall === 'east')

  return (
    <group>
      {/* 地板（法线朝上） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={room.floorColor} roughness={0.85} metalness={0} />
      </mesh>

      {/* 天花板（法线朝下，从上方俯视时被剔除，可看入室内） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={room.ceilingColor} roughness={0.95} side={THREE.FrontSide} />
      </mesh>

      {/* 四面墙 */}
      <Wall length={w} height={height} openings={northOpenings} position={[0, 0, -d / 2]} rotationY={0} color={room.wallColor} />
      <Wall length={w} height={height} openings={southOpenings} position={[0, 0, d / 2]} rotationY={Math.PI} color={room.wallColor} />
      <Wall length={d} height={height} openings={westOpenings} position={[-w / 2, 0, 0]} rotationY={Math.PI / 2} color={room.wallColor} />
      <Wall length={d} height={height} openings={eastOpenings} position={[w / 2, 0, 0]} rotationY={-Math.PI / 2} color={room.wallColor} />
    </group>
  )
}
