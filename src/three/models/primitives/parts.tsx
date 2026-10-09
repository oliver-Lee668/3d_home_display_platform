import type { ReactNode } from 'react'
import { RoundedBox } from '@react-three/drei'
import type { Size3 } from '../../../types'

export type Vec3 = [number, number, number]

/** 标准材质参数（来自主材质选项） */
export interface SurfaceProps {
  color: string
  metalness?: number
  roughness?: number
}

/** 程序化模型统一入参：尺寸 + 主材质 */
export interface ModelProps {
  size: Size3
  color: string
  metalness: number
  roughness: number
}

/** 统一环境反射强度：让布/木/金属都带一点环境光，提升材质可信度 */
export const ENV_INTENSITY = 0.7

interface BoxMeshProps extends SurfaceProps {
  size: Vec3
  position?: Vec3
  rotation?: Vec3
  /** 关闭阴影投射（如地毯等薄片） */
  noShadow?: boolean
}

/** 通用长方体构件 */
export function BoxMesh({
  size,
  position,
  rotation,
  color,
  metalness = 0,
  roughness = 0.8,
  noShadow = false,
}: BoxMeshProps) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={!noShadow}
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={ENV_INTENSITY} />
    </mesh>
  )
}

interface CylMeshProps extends SurfaceProps {
  radiusTop: number
  radiusBottom: number
  height: number
  position?: Vec3
  rotation?: Vec3
  segments?: number
}

/** 通用圆柱/圆台构件 */
export function CylMesh({
  radiusTop,
  radiusBottom,
  height,
  position,
  rotation,
  color,
  metalness = 0,
  roughness = 0.6,
  segments = 20,
}: CylMeshProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, segments]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={ENV_INTENSITY} />
    </mesh>
  )
}

interface SoftBoxProps extends SurfaceProps {
  size: Vec3
  position?: Vec3
  rotation?: Vec3
  /** 圆角半径，自动钳制到不超过最小边的一半 */
  radius?: number
  noShadow?: boolean
}

/** 圆润长方体构件：用于沙发/床垫/柜体等软包或注塑表面，去掉"纸盒感" */
export function SoftBox({
  size,
  position,
  rotation,
  color,
  metalness = 0,
  roughness = 0.8,
  radius = 0.035,
  noShadow = false,
}: SoftBoxProps) {
  const r = Math.min(radius, Math.min(size[0], size[1], size[2]) * 0.45)
  return (
    <RoundedBox
      args={size}
      radius={r}
      smoothness={4}
      position={position}
      rotation={rotation}
      castShadow={!noShadow}
      receiveShadow
    >
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={ENV_INTENSITY} />
    </RoundedBox>
  )
}

/** 常用点缀色 */
export const ACCENT = {
  woodLeg: '#6b4a2f',
  darkMetal: '#3a3d42',
  chrome: '#c8ccd0',
  black: '#1b1c1f',
  screen: '#0b0f16',
}

/** 包裹一组构件 */
export function Group({
  position,
  rotation,
  children,
}: {
  position?: Vec3
  rotation?: Vec3
  children: ReactNode
}) {
  return (
    <group position={position} rotation={rotation}>
      {children}
    </group>
  )
}
