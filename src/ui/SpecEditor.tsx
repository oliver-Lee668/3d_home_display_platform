import { useState, useRef, type ChangeEvent } from 'react'
import type { Product, ProductSpec } from '../types'
import { api, API_BASE } from '../lib/api'
import { useCatalogStore } from '../store/useCatalogStore'

const DRAWING_EXT = '.pdf,.dwg,.dxf,.step,.stp,.iges,.igs,.zip'

/** 图纸一律存后端相对路径，避免把部署地址写进数据库 */
function toRelative(url: string): string {
  return url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url
}

/** 图纸受鉴权保护，<a href> 带不上 Authorization 头，只能走 fetch + blob 下载 */
async function saveDrawing(url: string, name: string): Promise<string | null> {
  try {
    await api.downloadDrawing(url, name)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : '图纸下载失败'
  }
}

/**
 * 商品规格主数据编辑器（销售端）。
 * 保存后写入目录条目，用户端刷新即生效；下单时随订单快照冻结，成为生产加工依据。
 */
export function SpecEditor({
  product,
  working,
  onSave,
  onCancel,
}: {
  product: Product
  working: boolean
  onSave: (spec: ProductSpec) => Promise<void>
  onCancel: () => void
}) {
  const upload = useCatalogStore((s) => s.upload)
  const spec = product.spec ?? {}

  const [sku, setSku] = useState(spec.sku ?? '')
  const [materialSku, setMaterialSku] = useState(spec.materialSku ?? '')
  const [craft, setCraft] = useState(spec.craft ?? '')
  const [packing, setPacking] = useState(spec.packing ?? '')
  const [labor, setLabor] = useState(spec.laborMinutes != null ? String(spec.laborMinutes) : '')
  const [scaleMin, setScaleMin] = useState(spec.scaleMin != null ? String(spec.scaleMin) : '')
  const [scaleMax, setScaleMax] = useState(spec.scaleMax != null ? String(spec.scaleMax) : '')
  const [drawings, setDrawings] = useState<{ name: string; url: string }[]>(spec.drawings ?? [])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickDrawing = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // 附件名去掉扩展名，便于生产端识别
    const name = file.name.replace(/\.[^.]+$/, '') || file.name
    setUploading(true)
    setError(null)
    void (async () => {
      try {
        const url = await upload(file)
        setDrawings((prev) => [...prev, { name, url: toRelative(url) }])
      } catch (err) {
        setError(`图纸上传失败：${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setUploading(false)
      }
    })()
  }

  const submit = () => {
    const laborMinutes = labor.trim() === '' ? undefined : Number(labor)
    if (laborMinutes != null && (!Number.isFinite(laborMinutes) || laborMinutes < 0)) {
      return setError('单件工时需为非负数字（分钟）')
    }
    const min = scaleMin.trim() === '' ? undefined : Number(scaleMin)
    const max = scaleMax.trim() === '' ? undefined : Number(scaleMax)
    if (min != null && (!Number.isFinite(min) || min <= 0)) return setError('缩放下限需为大于 0 的数字')
    if (max != null && (!Number.isFinite(max) || max <= 0)) return setError('缩放上限需为大于 0 的数字')
    if (min != null && max != null && min > max) return setError('缩放下限不能大于上限')

    setError(null)
    const next: ProductSpec = {
      sku: sku.trim() || undefined,
      materialSku: materialSku.trim() || undefined,
      craft: craft.trim() || undefined,
      packing: packing.trim() || undefined,
      laborMinutes,
      scaleMin: min,
      scaleMax: max,
      drawings: drawings.length ? drawings : undefined,
    }
    void onSave(next)
  }

  const field = 'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100'

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-slate-400">
          型号 SKU
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={field} placeholder="如 SF-3P-210" />
        </label>
        <label className="text-[11px] text-slate-400">
          主材 SKU
          <input
            value={materialSku}
            onChange={(e) => setMaterialSku(e.target.value)}
            className={field}
            placeholder="面料/板材编码"
          />
        </label>
        <label className="text-[11px] text-slate-400">
          单件工时(分钟)
          <input
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className={field}
            inputMode="numeric"
            placeholder="如 240"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">
            缩放下限
            <input
              value={scaleMin}
              onChange={(e) => setScaleMin(e.target.value)}
              className={field}
              inputMode="decimal"
              placeholder="0.9"
            />
          </label>
          <label className="text-[11px] text-slate-400">
            缩放上限
            <input
              value={scaleMax}
              onChange={(e) => setScaleMax(e.target.value)}
              className={field}
              inputMode="decimal"
              placeholder="1.15"
            />
          </label>
        </div>
        <label className="col-span-2 text-[11px] text-slate-400 sm:col-span-4">
          工艺要求 / 加工路线
          <textarea
            value={craft}
            onChange={(e) => setCraft(e.target.value)}
            rows={2}
            className={field}
            placeholder="如：框架拼装 → 海绵裁剪 → 面料车缝 → 绷架包覆 → 质检"
          />
        </label>
        <label className="col-span-2 text-[11px] text-slate-400 sm:col-span-4">
          包装规格
          <input
            value={packing}
            onChange={(e) => setPacking(e.target.value)}
            className={field}
            placeholder="如：平板包装 2 件/套，含五金包"
          />
        </label>
      </div>

      {/* 图纸附件 */}
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400">图纸/工艺文件</span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-dashed border-white/20 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            {uploading ? '上传中…' : '+ 上传图纸（PDF/DWG/STEP）'}
          </button>
          <span className="text-[10px] text-slate-500">仅已登录员工可下载，单文件 ≤ 64MB</span>
        </div>
        {drawings.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {drawings.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={async () => {
                    const err = await saveDrawing(d.url, d.name)
                    if (err) setError(err)
                  }}
                  className="text-brand-400 hover:underline"
                  title="下载查看（图纸仅限已登录员工）"
                >
                  {d.name}
                </button>
                <span className="text-slate-600">{d.url.split('/').pop()}</span>
                <button
                  onClick={() => setDrawings((prev) => prev.filter((_, k) => k !== i))}
                  className="ml-auto rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/10"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={working || uploading}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-[12px] text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          保存规格
        </button>
        <button onClick={onCancel} className="rounded-lg px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10">
          取消
        </button>
        <span className="ml-auto text-[10px] text-slate-500">
          缩放范围即定制可行域：填 1~1 表示该商品不接受尺寸定制（如家电标准品）
        </span>
      </div>
      <input ref={fileRef} type="file" accept={DRAWING_EXT} className="hidden" onChange={onPickDrawing} />
    </div>
  )
}
