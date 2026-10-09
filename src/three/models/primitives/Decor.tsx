import type { ModelProps } from './parts'
import { BoxMesh, CylMesh, ACCENT } from './parts'

/**
 * 软装类程序化占位模型。底面中心为原点，向 +y 生长。
 */

const POT = '#b5715a'
const SOIL = '#4a3b2a'
const TRUNK = '#6b4a2f'

/** 绿植盆栽 */
export function Plant({ size, color, roughness }: ModelProps) {
  const { w, h } = size
  const potH = h * 0.22
  const potR = w * 0.34
  const crownBase = potH + h * 0.08

  // 若干球状叶簇
  const blobs: Array<[number, number, number, number]> = [
    [0, crownBase + h * 0.34, 0, w * 0.36],
    [-w * 0.16, crownBase + h * 0.2, w * 0.1, w * 0.26],
    [w * 0.17, crownBase + h * 0.24, -w * 0.08, w * 0.24],
    [w * 0.04, crownBase + h * 0.48, w * 0.06, w * 0.22],
  ]

  return (
    <group>
      {/* 花盆 */}
      <CylMesh radiusTop={potR} radiusBottom={potR * 0.78} height={potH} position={[0, potH / 2, 0]} color={POT} roughness={0.8} />
      {/* 土壤 */}
      <CylMesh radiusTop={potR * 0.92} radiusBottom={potR * 0.92} height={0.02} position={[0, potH - 0.01, 0]} color={SOIL} roughness={1} />
      {/* 主干 */}
      <CylMesh radiusTop={0.025} radiusBottom={0.035} height={h * 0.34} position={[0, potH + (h * 0.34) / 2, 0]} color={TRUNK} roughness={0.9} />
      {/* 叶簇 */}
      {blobs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={color} roughness={roughness} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** 落地灯 */
export function Lamp({ size, color, roughness }: ModelProps) {
  const { w, h } = size
  const poleH = h * 0.78
  const shadeH = h * 0.26
  const shadeY = poleH + shadeH / 2 - 0.02

  return (
    <group>
      {/* 底座 */}
      <CylMesh radiusTop={w * 0.4} radiusBottom={w * 0.44} height={0.03} position={[0, 0.015, 0]} color={ACCENT.darkMetal} metalness={0.5} roughness={0.4} />
      {/* 灯杆 */}
      <CylMesh radiusTop={0.018} radiusBottom={0.022} height={poleH} position={[0, poleH / 2, 0]} color={ACCENT.chrome} metalness={0.8} roughness={0.3} />
      {/* 灯罩（自发光） */}
      <mesh position={[0, shadeY, 0]} castShadow>
        <cylinderGeometry args={[w * 0.3, w * 0.46, shadeH, 24, 1, true]} />
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          side={2}
          emissive={color}
          emissiveIntensity={0.45}
        />
      </mesh>
      {/* 灯泡光点 */}
      <mesh position={[0, shadeY - shadeH * 0.15, 0]}>
        <sphereGeometry args={[w * 0.12, 12, 12]} />
        <meshStandardMaterial color={'#fff6e0'} emissive={'#ffe6b0'} emissiveIntensity={1.4} />
      </mesh>
    </group>
  )
}

/** 地毯（薄片，仅接收阴影） */
export function Rug({ size, color, roughness }: ModelProps) {
  const { w, h, d } = size
  const t = Math.max(0.012, h)

  return (
    <group>
      {/* 主体 */}
      <BoxMesh size={[w, t, d]} position={[0, t / 2, 0]} color={color} roughness={roughness} noShadow />
      {/* 内边框装饰 */}
      <BoxMesh size={[w * 0.86, t + 0.002, d * 0.82]} position={[0, t / 2 + 0.001, 0]} color={mix(color)} roughness={roughness} noShadow />
    </group>
  )
}

/** 简单的颜色加深工具（用于地毯内边框） */
function mix(hex: string): string {
  const c = hex.replace('#', '')
  const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16)
  const r = Math.max(0, ((num >> 16) & 255) - 28)
  const g = Math.max(0, ((num >> 8) & 255) - 28)
  const b = Math.max(0, (num & 255) - 28)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
