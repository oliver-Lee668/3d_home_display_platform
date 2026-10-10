/** 将上传的图片文件读取并缩放为最长边不超过 max 的 JPEG dataURL，控制 localStorage 体积 */
export function fileToImageDataUrl(file: File, max = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('read fail'))
    fr.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode fail'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const cw = Math.max(1, Math.round(img.width * scale))
        const ch = Math.max(1, Math.round(img.height * scale))
        const c = document.createElement('canvas')
        c.width = cw
        c.height = ch
        const ctx = c.getContext('2d')
        if (!ctx) return reject(new Error('no ctx'))
        ctx.drawImage(img, 0, 0, cw, ch)
        resolve(c.toDataURL('image/jpeg', quality))
      }
      img.src = String(fr.result)
    }
    fr.readAsDataURL(file)
  })
}
