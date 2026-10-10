import { useRef, type ChangeEvent } from 'react'
import { useSceneStore } from '../store/useSceneStore'
import { useCatalogStore } from '../store/useCatalogStore'
import { fileToImageDataUrl } from '../lib/image'
import { Icon } from './icons'

/** 地板饰面选择弹层：内置预设 + 销售端上传的地板 + 本地自定义上传 */
export function FloorPicker({ onClose }: { onClose: () => void }) {
  const floor = useSceneStore((s) => s.floor)
  const setFloor = useSceneStore((s) => s.setFloor)
  const notify = useSceneStore((s) => s.notify)
  const floors = useCatalogStore((s) => s.floors)
  const fileRef = useRef<HTMLInputElement>(null)
  // 本地临时上传的自定义地板（id 固定为 'custom'）；销售端上传的地板 kind 也是 custom，需区分
  const localCustom = floor.kind === 'custom' && floor.id === 'custom'

  const handleCustom = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const image = await fileToImageDataUrl(file, 512)
      setFloor({
        id: 'custom',
        label: '自定义地板',
        kind: 'custom',
        baseColor: '#ffffff',
        swatch: '#8a8f98',
        image,
      })
      notify('已应用自定义地板')
    } catch {
      notify('图片读取失败，请重试')
    }
  }

  return (
    <div className="panel pointer-events-auto fixed right-3 top-16 z-40 w-64 rounded-xl p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">地板饰面</span>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" title="关闭">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => setFloor(f)}
            className={`flex items-center gap-2 rounded-lg border p-1.5 text-left transition ${
              floor.id === f.id ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'
            }`}
          >
            {f.image ? (
              <img src={f.image} alt={f.label} className="h-7 w-7 shrink-0 rounded object-cover" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded" style={{ background: f.swatch }} />
            )}
            <span className="truncate text-[12px] text-slate-200">{f.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        className={`mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed p-2 text-left transition ${
          localCustom ? 'border-brand-500 bg-brand-500/10' : 'border-white/20 hover:bg-white/5'
        }`}
      >
        {localCustom && floor.image ? (
          <img src={floor.image} alt="自定义地板" className="h-7 w-7 rounded object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-slate-300">
            <Icon name="plus" size={14} />
          </span>
        )}
        <span className="text-[12px] text-slate-200">上传自定义地板图</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCustom} />
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        地板按房间尺寸自动平铺，可即时切换；列表中的地板可由销售端上传更新。本地上传的自定义地板仅自己可见。
      </p>
    </div>
  )
}
