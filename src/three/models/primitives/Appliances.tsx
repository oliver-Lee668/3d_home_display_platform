import type { ModelProps } from './parts'
import { BoxMesh, SoftBox, CylMesh, ACCENT } from './parts'

/**
 * 家电类程序化占位模型。底面中心为原点，向 +y 生长。
 */

/** 对开门冰箱 */
export function Fridge({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const foot = 0.06

  return (
    <group>
      {/* 主体 */}
      <SoftBox size={[w, h - foot, d]} position={[0, foot + (h - foot) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.03} />
      {/* 中缝（对开门） */}
      <BoxMesh size={[0.012, h - foot - 0.12, 0.012]} position={[0, foot + (h - foot) / 2, d / 2 + 0.001]} color={ACCENT.darkMetal} roughness={0.5} />
      {/* 竖向把手 */}
      <CylMesh radiusTop={0.016} radiusBottom={0.016} height={h * 0.42} position={[-0.07, h * 0.58, d / 2 + 0.05]} color={ACCENT.chrome} metalness={0.95} roughness={0.2} />
      <CylMesh radiusTop={0.016} radiusBottom={0.016} height={h * 0.42} position={[0.07, h * 0.58, d / 2 + 0.05]} color={ACCENT.chrome} metalness={0.95} roughness={0.2} />
      {/* 显示面板 */}
      <BoxMesh size={[w * 0.3, 0.08, 0.01]} position={[-w * 0.22, h * 0.72, d / 2 + 0.006]} color={ACCENT.screen} roughness={0.3} metalness={0.2} />
      {/* 底脚 */}
      <BoxMesh size={[w * 0.94, foot, d * 0.9]} position={[0, foot / 2, 0]} color={ACCENT.darkMetal} roughness={0.6} />
    </group>
  )
}

/** 平板电视（带底座） */
export function TV({ size, color, metalness, roughness }: ModelProps) {
  const { w, h } = size
  const standH = 0.16
  const bezel = 0.025

  return (
    <group>
      {/* 底座 */}
      <BoxMesh size={[w * 0.36, 0.02, 0.22]} position={[0, 0.01, 0.04]} color={ACCENT.black} roughness={0.4} metalness={0.3} />
      {/* 支架颈 */}
      <BoxMesh size={[0.06, standH, 0.06]} position={[0, standH / 2, 0]} color={ACCENT.black} roughness={0.4} metalness={0.3} />
      {/* 边框 */}
      <SoftBox size={[w, h, 0.035]} position={[0, standH + h / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.012} />
      {/* 屏幕 */}
      <mesh position={[0, standH + h / 2, 0.019]}>
        <planeGeometry args={[w - bezel * 2, h - bezel * 2]} />
        <meshStandardMaterial color={ACCENT.screen} roughness={0.15} metalness={0.4} emissive={'#0a1a2a'} emissiveIntensity={0.35} />
      </mesh>
    </group>
  )
}

/** 滚筒洗衣机 */
export function Washer({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const doorR = w * 0.28
  const doorY = h * 0.42

  return (
    <group>
      {/* 主体 */}
      <SoftBox size={[w, h, d]} position={[0, h / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.03} />
      {/* 顶部控制面板 */}
      <BoxMesh size={[w * 0.94, 0.12, 0.02]} position={[0, h - 0.09, d / 2 + 0.002]} color={ACCENT.darkMetal} roughness={0.4} metalness={0.3} />
      {/* 小显示屏 */}
      <BoxMesh size={[w * 0.28, 0.05, 0.012]} position={[w * 0.2, h - 0.09, d / 2 + 0.012]} color={ACCENT.screen} roughness={0.3} />
      {/* 舱门外圈 */}
      <CylMesh radiusTop={doorR} radiusBottom={doorR} height={0.05} position={[0, doorY, d / 2 + 0.01]} rotation={[Math.PI / 2, 0, 0]} color={ACCENT.chrome} metalness={0.85} roughness={0.25} segments={32} />
      {/* 舱门玻璃 */}
      <CylMesh radiusTop={doorR * 0.78} radiusBottom={doorR * 0.78} height={0.03} position={[0, doorY, d / 2 + 0.035]} rotation={[Math.PI / 2, 0, 0]} color={'#26313a'} roughness={0.15} metalness={0.3} segments={32} />
      {/* 洗涤剂盒 */}
      <BoxMesh size={[w * 0.3, 0.09, 0.02]} position={[-w * 0.28, h * 0.72, d / 2 + 0.008]} color={ACCENT.darkMetal} roughness={0.5} />
    </group>
  )
}
