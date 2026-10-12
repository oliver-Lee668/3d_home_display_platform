/** 触发浏览器下载文本文件；CSV 自动加 BOM，避免 Excel 打开中文乱码 */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const body = mime.startsWith('text/csv') ? '\ufeff' + text : text
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
