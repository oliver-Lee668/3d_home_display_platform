import * as THREE from 'three'

/** 将 hex 颜色按倍率提亮/压暗，返回 rgb() 字符串 */
function shade(hex: string, mul: number): string {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const num = parseInt(full, 16)
  const r = Math.min(255, Math.round(((num >> 16) & 255) * mul))
  const g = Math.min(255, Math.round(((num >> 8) & 255) * mul))
  const b = Math.min(255, Math.round((num & 255) * mul))
  return `rgb(${r},${g},${b})`
}

/**
 * 程序化木地板贴图：板条 + 木纹 + 错缝，可平铺。
 * 离线生成，无需外部资源；配合 RepeatWrapping 按房间尺寸平铺。
 */
export function makeWoodFloorTexture(base = '#b08d5f', planks = 6): THREE.CanvasTexture {
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)

  const plankH = S / planks
  for (let i = 0; i < planks; i++) {
    const y = i * plankH
    // 每块板轻微色差，避免均匀塑料感
    ctx.fillStyle = shade(base, 0.88 + Math.random() * 0.24)
    ctx.fillRect(0, y, S, plankH)

    // 木纹：半透明横向贝塞尔条纹
    for (let g = 0; g < 22; g++) {
      const gy = y + Math.random() * plankH
      ctx.strokeStyle = `rgba(58,38,20,${0.03 + Math.random() * 0.06})`
      ctx.lineWidth = 1 + Math.random() * 2
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.bezierCurveTo(
        S * 0.3, gy + (Math.random() - 0.5) * 6,
        S * 0.6, gy + (Math.random() - 0.5) * 6,
        S, gy,
      )
      ctx.stroke()
    }

    // 板缝（深色横线）
    ctx.fillStyle = 'rgba(40,26,14,0.5)'
    ctx.fillRect(0, y, S, 2)

    // 竖向错缝
    const seams = 1 + Math.floor(Math.random() * 2)
    for (let s = 0; s < seams; s++) {
      const sx = Math.random() * S
      ctx.fillRect(sx, y, 2, plankH)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
