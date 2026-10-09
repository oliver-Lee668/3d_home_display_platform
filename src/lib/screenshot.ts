/** 抓取当前 3D 画布为 PNG dataURL（依赖 Canvas 的 preserveDrawingBuffer:true） */
export function captureScene(): string | null {
  const el = document.querySelector('canvas') as HTMLCanvasElement | null
  if (!el) return null
  try {
    return el.toDataURL('image/png')
  } catch {
    return null
  }
}

/** 触发浏览器下载 */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** 截图并下载，返回是否成功 */
export function takeScreenshot(namePrefix = 'showroom'): boolean {
  const url = captureScene()
  if (!url) return false
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  downloadDataUrl(url, `${namePrefix}-${ts}.png`)
  return true
}
