/**
 * 三视图工单图生成器。
 *
 * 生成的是"外形投影 + 尺寸标注"的工单示意图（正视图/侧视图/俯视图 + 标题栏），
 * 生产读图靠它拿到定制后的实际毫米尺寸；精确几何由销售端上传的 CAD 图纸
 * （PDF/DWG/STEP）承担。相比对 3D 场景做离屏渲染，这种方式确定性强、体积小、
 * 可直接打印进工单，也不需要让员工端产物引入 three.js。
 */

/** 生成三视图所需输入（尺寸均为定制后的实际毫米值） */
export interface ThreeViewInput {
  name: string
  sku?: string
  material?: string
  colorCode?: string
  qty?: number
  scale?: number
  sizeMm: { w: number; h: number; d: number }
  craft?: string
  packing?: string
  laborMinutes?: number
}

const CANVAS_W = 900
const CANVAS_H = 400
const PANEL_W = 280
const PANEL_TOP = 44
const AREA_W = 170
const AREA_H = 150
const AREA_LEFT = 44
const AREA_TOP = 30

/** 输出 JPEG dataURL（失败返回空串，调用方按"无图"处理） */
export function makeThreeViewDataUrl(input: ThreeViewInput): string {
  try {
    const c = document.createElement('canvas')
    c.width = CANVAS_W
    c.height = CANVAS_H
    const ctx = c.getContext('2d')
    if (!ctx) return ''

    // 背景
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    drawHeader(ctx, input)

    const { w, h, d } = input.sizeMm
    const panels: { title: string; ow: number; oh: number; capW: string; capH: string }[] = [
      { title: '正视图', ow: w, oh: h, capW: `宽 ${w}`, capH: `高 ${h}` },
      { title: '侧视图', ow: d, oh: h, capW: `深 ${d}`, capH: `高 ${h}` },
      { title: '俯视图', ow: w, oh: d, capW: `宽 ${w}`, capH: `深 ${d}` },
    ]
    panels.forEach((p, i) => drawPanel(ctx, 20 + i * (PANEL_W + 20), PANEL_TOP, p))

    drawTitleBlock(ctx, input)

    // 外框
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1
    ctx.strokeRect(6.5, 6.5, CANVAS_W - 13, CANVAS_H - 13)

    return c.toDataURL('image/jpeg', 0.82)
  } catch {
    return ''
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, input: ThreeViewInput) {
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 17px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(input.name, 20, 30)

  ctx.fillStyle = '#64748b'
  ctx.font = '12px "Microsoft YaHei", sans-serif'
  const sku = input.sku ? `型号 ${input.sku}` : '型号 未编码'
  ctx.fillText(sku, 20 + ctx.measureText(input.name).width + 40, 30)

  ctx.textAlign = 'right'
  ctx.fillText(`生成于 ${new Date().toLocaleString('zh-CN')}`, CANVAS_W - 20, 30)
  ctx.textAlign = 'left'
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  p: { title: string; ow: number; oh: number; capW: string; capH: string },
) {
  // 面板边框与标题
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.strokeRect(px + 0.5, py + 0.5, PANEL_W - 1, 210)
  ctx.fillStyle = '#334155'
  ctx.font = '12px "Microsoft YaHei", sans-serif'
  ctx.fillText(p.title, px + 10, py + 18)

  if (!p.ow || !p.oh) {
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('未提供尺寸', px + 10, py + 110)
    return
  }

  const s = Math.min(AREA_W / p.ow, AREA_H / p.oh)
  const rw = Math.max(4, p.ow * s)
  const rh = Math.max(4, p.oh * s)
  const rx = px + AREA_LEFT + (AREA_W - rw) / 2
  const ry = py + AREA_TOP + (AREA_H - rh) / 2

  // 外形投影
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(rx, ry, rw, rh)
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 2
  ctx.strokeRect(rx, ry, rw, rh)

  // 水平尺寸线（下方）
  dimLine(ctx, rx, ry + rh + 20, rx + rw, ry + rh + 20, `${p.capW} mm`, 'h')
  // 垂直尺寸线（右侧）
  dimLine(ctx, rx + rw + 20, ry, rx + rw + 20, ry + rh, `${p.capH} mm`, 'v')
}

/** 绘制带端点刻度的尺寸线与文字（dir: h 水平 / v 垂直） */
function dimLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  text: string,
  dir: 'h' | 'v',
) {
  ctx.strokeStyle = '#dc2626'
  ctx.fillStyle = '#dc2626'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  if (dir === 'h') {
    ctx.moveTo(x1, y1 - 4)
    ctx.lineTo(x1, y1 + 4)
    ctx.moveTo(x2, y2 - 4)
    ctx.lineTo(x2, y2 + 4)
  } else {
    ctx.moveTo(x1 - 4, y1)
    ctx.lineTo(x1 + 4, y1)
    ctx.moveTo(x2 - 4, y2)
    ctx.lineTo(x2 + 4, y2)
  }
  ctx.stroke()

  ctx.font = '11px "Microsoft YaHei", sans-serif'
  if (dir === 'h') {
    ctx.textAlign = 'center'
    ctx.fillText(text, (x1 + x2) / 2, y1 + 16)
    ctx.textAlign = 'left'
  } else {
    ctx.save()
    ctx.translate(x1 + 14, (y1 + y2) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
}

function drawTitleBlock(ctx: CanvasRenderingContext2D, input: ThreeViewInput) {
  const top = 268
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.strokeRect(19.5, top + 0.5, CANVAS_W - 40, 118)

  const { w, h, d } = input.sizeMm
  const rows: [string, string][] = [
    ['实际尺寸', `${w} × ${d} × ${h} mm（宽 × 深 × 高）`],
    ['数量', `${input.qty ?? 1} 件`],
    ['材质', `${input.material ?? '—'}${input.colorCode ? `（色号 ${input.colorCode}）` : ''}`],
    [
      '定制缩放',
      input.scale && input.scale !== 1
        ? `×${input.scale.toFixed(2)}（非标定制，按换算尺寸加工）`
        : '标准尺寸',
    ],
    ['工艺要求', input.craft || '—'],
    ['包装', input.packing || '—'],
    [
      '工时',
      input.laborMinutes
        ? `单件 ${input.laborMinutes} 分钟 / 合计 ${input.laborMinutes * (input.qty ?? 1)} 分钟`
        : '—',
    ],
  ]

  ctx.font = '12px "Microsoft YaHei", sans-serif'
  rows.forEach((r, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 34 + col * ((CANVAS_W - 60) / 2)
    const y = top + 22 + row * 20
    ctx.fillStyle = '#64748b'
    ctx.fillText(r[0], x, y)
    ctx.fillStyle = '#0f172a'
    ctx.fillText(r[1], x + 70, y)
  })
}
