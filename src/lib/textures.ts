import * as THREE from 'three'
import type { FloorFinish } from '../types'

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

/** 创建 S×S 画布并返回 [canvas, ctx] */
function canvasOf(S: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  return [c, c.getContext('2d')!]
}

/** 将画布包装为可平铺贴图并设置 repeat */
function finishTex(canvas: HTMLCanvasElement, rx: number, ry: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.repeat.set(rx, ry)
  return t
}

/** 大理石：浅底 + 灰色云纹/裂纹 */
function makeMarble(base: string): HTMLCanvasElement {
  const S = 512
  const [c, ctx] = canvasOf(S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  // 云状斑块
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 30 + Math.random() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(160,160,165,0.10)')
    g.addColorStop(1, 'rgba(160,160,165,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 裂纹脉络
  for (let v = 0; v < 14; v++) {
    ctx.strokeStyle = `rgba(120,120,128,${0.10 + Math.random() * 0.15})`
    ctx.lineWidth = 0.6 + Math.random() * 1.6
    ctx.beginPath()
    let x = Math.random() * S
    let y = Math.random() * S
    ctx.moveTo(x, y)
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 160
      y += (Math.random() - 0.5) * 160
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return c
}

/** 瓷砖：方砖 + 深色勾缝 */
function makeTile(base: string): HTMLCanvasElement {
  const S = 512
  const [c, ctx] = canvasOf(S)
  const n = 4
  const t = S / n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade(base, 0.94 + Math.random() * 0.12)
      ctx.fillRect(i * t, j * t, t, t)
    }
  }
  ctx.fillStyle = 'rgba(70,72,76,0.6)'
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(i * t - 1.5, 0, 3, S)
    ctx.fillRect(0, i * t - 1.5, S, 3)
  }
  return c
}

/** 水泥：灰底 + 深浅斑块与细小颗粒 */
function makeConcrete(base: string): HTMLCanvasElement {
  const S = 512
  const [c, ctx] = canvasOf(S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 12 + Math.random() * 60
    const dark = Math.random() > 0.5
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, dark ? 'rgba(90,94,99,0.10)' : 'rgba(200,204,208,0.10)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '70,72,76' : '210,214,218'},${0.05 + Math.random() * 0.08})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4)
  }
  return c
}

/** 地毯：密织短线噪声 */
function makeCarpet(base: string): HTMLCanvasElement {
  const S = 512
  const [c, ctx] = canvasOf(S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const dark = Math.random() > 0.5
    ctx.strokeStyle = dark ? 'rgba(120,105,85,0.10)' : 'rgba(255,250,240,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3)
    ctx.stroke()
  }
  return c
}

/**
 * 按地板饰面生成可平铺贴图。
 * custom 走用户上传图（TextureLoader 异步加载，返回后即可用）。
 */
export function makeFloorTexture(f: FloorFinish, rx: number, ry: number): THREE.Texture {
  if (f.kind === 'custom' && f.image) {
    const t = new THREE.TextureLoader().load(f.image)
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.repeat.set(rx, ry)
    return t
  }
  switch (f.kind) {
    case 'marble':
      return finishTex(makeMarble(f.baseColor), rx, ry)
    case 'tile':
      return finishTex(makeTile(f.baseColor), rx, ry)
    case 'concrete':
      return finishTex(makeConcrete(f.baseColor), rx, ry)
    case 'carpet':
      return finishTex(makeCarpet(f.baseColor), rx, ry)
    case 'wood':
    default: {
      const t = makeWoodFloorTexture(f.baseColor)
      t.repeat.set(rx, ry)
      return t
    }
  }
}
