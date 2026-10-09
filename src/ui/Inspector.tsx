import type { ReactNode } from 'react'
import { getProduct } from '../data/catalog'
import { useSceneStore } from '../store/useSceneStore'
import { SCALE_MIN, SCALE_MAX } from '../lib/placement'
import { Icon } from './icons'

const radToDeg = (r: number) => (((r * 180) / Math.PI) % 360 + 360) % 360

export function Inspector() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const item = useSceneStore((s) => s.items.find((i) => i.instanceId === s.selectedId))
  const updateItem = useSceneStore((s) => s.updateItem)
  const removeItem = useSceneStore((s) => s.removeItem)
  const duplicateItem = useSceneStore((s) => s.duplicateItem)
  const select = useSceneStore((s) => s.select)

  if (!selectedId || !item) return null
  const product = getProduct(item.productId)
  if (!product) return null

  const deg = Math.round(radToDeg(item.rotationY))

  return (
    <aside className="panel absolute right-3 top-16 z-20 flex w-[17rem] max-w-[85vw] flex-col gap-3 rounded-2xl p-4 shadow-xl">
      {/* 标题 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">{product.name}</h3>
          <p className="text-[11px] text-slate-400">
            {product.size.w}×{product.size.d}×{product.size.h} m
            {product.price != null && <span className="ml-2 text-amber-300/90">¥{product.price}</span>}
          </p>
        </div>
        <button
          onClick={() => select(null)}
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          title="取消选中"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* 旋转 */}
      <Field label="旋转" value={`${deg}°`}>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={deg}
          onChange={(e) => updateItem(item.instanceId, { rotationY: (Number(e.target.value) * Math.PI) / 180 })}
        />
      </Field>

      {/* 缩放 */}
      <Field label="缩放" value={`${Math.round(item.scale * 100)}%`}>
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={0.05}
          value={item.scale}
          onChange={(e) => updateItem(item.instanceId, { scale: Number(e.target.value) })}
        />
      </Field>

      {/* 位置（只读） */}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>位置</span>
        <span className="font-mono text-slate-300">
          x {item.position[0].toFixed(2)} · z {item.position[2].toFixed(2)}
        </span>
      </div>

      {/* 材质/颜色 */}
      {product.materials.length > 1 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">材质 / 颜色</p>
          <div className="flex flex-wrap gap-2">
            {product.materials.map((m) => {
              const active = m.id === item.materialId
              return (
                <button
                  key={m.id}
                  onClick={() => updateItem(item.instanceId, { materialId: m.id })}
                  title={m.label}
                  className={`flex flex-col items-center gap-1 rounded-lg p-1 transition ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      active ? 'border-brand-500' : 'border-white/20'
                    }`}
                    style={{ background: m.color }}
                  />
                  <span className={`text-[10px] ${active ? 'text-slate-100' : 'text-slate-400'}`}>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 操作 */}
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => duplicateItem(item.instanceId)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[13px] text-slate-100 hover:bg-white/15"
        >
          <Icon name="copy" size={16} /> 复制
        </button>
        <button
          onClick={() => removeItem(item.instanceId)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600/80 py-2 text-[13px] text-white hover:bg-rose-600"
        >
          <Icon name="trash" size={16} /> 删除
        </button>
      </div>
    </aside>
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="font-mono text-slate-300">{value}</span>
      </div>
      {children}
    </div>
  )
}
