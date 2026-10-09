import type { ModelProps } from './parts'
import { BoxMesh, SoftBox, CylMesh, ACCENT } from './parts'

/**
 * 家具类程序化占位模型。
 * 约定：所有模型以底面中心为原点，向 +y 生长（y=0 即贴地）。
 * 尺寸按商品 size(w=宽/x, h=高/y, d=深/z) 比例构建。
 */

const BLANKET = '#9fb3c8'
const MATTRESS = '#f6f4ef'

/** 三人/多人沙发 */
export function Sofa({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const legH = Math.min(0.12, h * 0.16)
  const armW = w * 0.14
  const seatBaseH = h * 0.34
  const backH = Math.max(0.2, h - legH - seatBaseH)
  const bodyY = legH + seatBaseH / 2
  const legX = w / 2 - 0.12
  const legZ = d / 2 - 0.12

  const cushionCount = w > 1.6 ? 3 : 2
  const cushW = (w - 2 * armW) / cushionCount - 0.04

  return (
    <group>
      {/* 座体 */}
      <SoftBox size={[w, seatBaseH, d]} position={[0, bodyY, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.05} />
      {/* 靠背 */}
      <SoftBox size={[w - 2 * armW, backH, d * 0.22]} position={[0, legH + seatBaseH + backH / 2, -d / 2 + d * 0.11]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      {/* 扶手 */}
      <SoftBox size={[armW, h * 0.62, d]} position={[-w / 2 + armW / 2, legH + (h * 0.62) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      <SoftBox size={[armW, h * 0.62, d]} position={[w / 2 - armW / 2, legH + (h * 0.62) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      {/* 座垫 */}
      {Array.from({ length: cushionCount }).map((_, i) => {
        const startX = -((cushionCount - 1) / 2) * (cushW + 0.04)
        return (
          <SoftBox
            key={i}
            size={[cushW, 0.12, d * 0.72]}
            position={[startX + i * (cushW + 0.04), legH + seatBaseH + 0.06, d * 0.06]}
            color={color}
            roughness={Math.min(1, roughness + 0.05)}
            metalness={metalness}
            radius={0.05}
          />
        )
      })}
      {/* 腿 */}
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z], i) => (
        <CylMesh key={i} radiusTop={0.035} radiusBottom={0.03} height={legH} position={[x, legH / 2, z]} color={ACCENT.woodLeg} roughness={0.5} />
      ))}
    </group>
  )
}

/** 单人扶手椅 */
export function Chair({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const legH = Math.min(0.14, h * 0.18)
  const seatH = h * 0.42
  const armW = w * 0.16
  const backH = h - legH - seatH
  const legX = w / 2 - 0.1
  const legZ = d / 2 - 0.1

  return (
    <group>
      {/* 座垫 */}
      <SoftBox size={[w, seatH, d]} position={[0, legH + seatH / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.05} />
      {/* 靠背 */}
      <SoftBox size={[w - 2 * armW * 0.4, backH, d * 0.2]} position={[0, legH + seatH + backH / 2, -d / 2 + d * 0.1]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      {/* 扶手 */}
      <SoftBox size={[armW, h * 0.55, d * 0.95]} position={[-w / 2 + armW / 2, legH + (h * 0.55) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      <SoftBox size={[armW, h * 0.55, d * 0.95]} position={[w / 2 - armW / 2, legH + (h * 0.55) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.04} />
      {/* 腿 */}
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z], i) => (
        <CylMesh key={i} radiusTop={0.03} radiusBottom={0.025} height={legH} position={[x, legH / 2, z]} color={ACCENT.woodLeg} roughness={0.5} />
      ))}
    </group>
  )
}

/** 双人床（含床头板、床垫、枕头、被子） */
export function Bed({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const legH = 0.1
  const frameH = h * 0.5
  const mattressH = Math.max(0.18, h * 0.34)
  const hbH = Math.max(0.75, h * 1.5)
  const frameTopY = legH + frameH

  return (
    <group>
      {/* 床架 */}
      <SoftBox size={[w, frameH, d]} position={[0, legH + frameH / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.03} />
      {/* 床垫 */}
      <SoftBox size={[w * 0.96, mattressH, d * 0.97]} position={[0, frameTopY + mattressH / 2, 0]} color={MATTRESS} roughness={0.95} radius={0.06} />
      {/* 被子 */}
      <SoftBox size={[w * 0.96, 0.06, d * 0.55]} position={[0, frameTopY + mattressH + 0.03, d * 0.18]} color={BLANKET} roughness={0.95} radius={0.025} />
      {/* 枕头 */}
      <SoftBox size={[w * 0.38, 0.12, 0.34]} position={[-w * 0.22, frameTopY + mattressH + 0.06, -d / 2 + 0.32]} color="#ffffff" roughness={0.98} radius={0.05} />
      <SoftBox size={[w * 0.38, 0.12, 0.34]} position={[w * 0.22, frameTopY + mattressH + 0.06, -d / 2 + 0.32]} color="#ffffff" roughness={0.98} radius={0.05} />
      {/* 床头板 */}
      <SoftBox size={[w, hbH, 0.08]} position={[0, legH + hbH / 2, -d / 2 + 0.04]} color={color} metalness={metalness} roughness={roughness} radius={0.03} />
      {/* 床脚 */}
      {[[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]].map(([x, z], i) => (
        <BoxMesh key={i} size={[0.08, legH, 0.08]} position={[x, legH / 2, z]} color={ACCENT.woodLeg} roughness={0.5} />
      ))}
    </group>
  )
}

/** 桌/几（coffee table 与 dining table 通用，矮桌带下层隔板） */
export function Table({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const topT = 0.05
  const legH = h - topT
  const legR = h > 0.6 ? 0.035 : 0.03
  const legX = w / 2 - 0.1
  const legZ = d / 2 - 0.1
  const hasShelf = h < 0.55

  return (
    <group>
      {/* 桌面 */}
      <SoftBox size={[w, topT, d]} position={[0, legH + topT / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.02} />
      {/* 桌腿 */}
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z], i) => (
        <CylMesh key={i} radiusTop={legR} radiusBottom={legR} height={legH} position={[x, legH / 2, z]} color={color} metalness={metalness} roughness={roughness} />
      ))}
      {/* 下层隔板（矮桌） */}
      {hasShelf && (
        <BoxMesh size={[w * 0.88, 0.03, d * 0.82]} position={[0, legH * 0.28, 0]} color={color} metalness={metalness} roughness={roughness} />
      )}
    </group>
  )
}

/** 电视柜/矮储物柜 */
export function Cabinet({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const legH = 0.1
  const bodyH = h - legH
  const legX = w / 2 - 0.12
  const legZ = d / 2 - 0.1

  return (
    <group>
      {/* 柜体 */}
      <SoftBox size={[w, bodyH, d]} position={[0, legH + bodyH / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.02} />
      {/* 门缝（两条竖线） */}
      <BoxMesh size={[0.02, bodyH * 0.82, 0.02]} position={[-w / 6, legH + bodyH / 2, d / 2 + 0.001]} color={ACCENT.darkMetal} roughness={0.6} />
      <BoxMesh size={[0.02, bodyH * 0.82, 0.02]} position={[w / 6, legH + bodyH / 2, d / 2 + 0.001]} color={ACCENT.darkMetal} roughness={0.6} />
      {/* 把手 */}
      <CylMesh radiusTop={0.012} radiusBottom={0.012} height={bodyH * 0.4} position={[-w / 6 + 0.05, legH + bodyH / 2, d / 2 + 0.03]} color={ACCENT.chrome} metalness={0.9} roughness={0.25} />
      <CylMesh radiusTop={0.012} radiusBottom={0.012} height={bodyH * 0.4} position={[w / 6 - 0.05, legH + bodyH / 2, d / 2 + 0.03]} color={ACCENT.chrome} metalness={0.9} roughness={0.25} />
      {/* 腿 */}
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z], i) => (
        <CylMesh key={i} radiusTop={0.025} radiusBottom={0.02} height={legH} position={[x, legH / 2, z]} color={ACCENT.woodLeg} roughness={0.5} />
      ))}
    </group>
  )
}

/** 双门衣柜 */
export function Wardrobe({ size, color, metalness, roughness }: ModelProps) {
  const { w, h, d } = size
  const plinth = 0.08

  return (
    <group>
      {/* 主体 */}
      <SoftBox size={[w, h - plinth, d]} position={[0, plinth + (h - plinth) / 2, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.02} />
      {/* 顶线 */}
      <SoftBox size={[w * 1.02, 0.05, d * 1.02]} position={[0, h - 0.025, 0]} color={color} metalness={metalness} roughness={roughness} radius={0.02} />
      {/* 中缝 */}
      <BoxMesh size={[0.02, h - plinth - 0.1, 0.02]} position={[0, plinth + (h - plinth) / 2, d / 2 + 0.001]} color={ACCENT.darkMetal} roughness={0.6} />
      {/* 竖向把手 */}
      <CylMesh radiusTop={0.014} radiusBottom={0.014} height={0.5} position={[-0.06, h * 0.55, d / 2 + 0.03]} color={ACCENT.chrome} metalness={0.9} roughness={0.25} />
      <CylMesh radiusTop={0.014} radiusBottom={0.014} height={0.5} position={[0.06, h * 0.55, d / 2 + 0.03]} color={ACCENT.chrome} metalness={0.9} roughness={0.25} />
      {/* 底座 */}
      <BoxMesh size={[w * 0.96, plinth, d * 0.94]} position={[0, plinth / 2, 0]} color={ACCENT.darkMetal} roughness={0.6} />
    </group>
  )
}
