import { useMemo, useState } from 'react'
import { CATEGORY_META, CATEGORY_ORDER } from '../data/catalog'
import type { Category } from '../types'
import { useSceneStore } from '../store/useSceneStore'
import { useCatalogStore } from '../store/useCatalogStore'
import { Icon } from './icons'

const TILE_COLORS: Record<Category, string> = {
  sofa: '#7c93b8',
  bed: '#b39ddb',
  table: '#c9a227',
  chair: '#8fbf7f',
  storage: '#d9a066',
  fridge: '#7fb2c9',
  tv: '#9aa4b2',
  washer: '#79c0b1',
  decor: '#d98cae',
}

type Filter = Category | 'all'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const addItem = useSceneStore((s) => s.addItem)
  // 目录为运行时数据：内置基线 + 销售端上传/替换/新增的商品
  const catalog = useCatalogStore((s) => s.products)

  // 仅显示目录中真实存在的分类
  const categories = useMemo(
    () => CATEGORY_ORDER.filter((c) => catalog.some((p) => p.category === c)),
    [catalog],
  )

  const products = useMemo(
    () => (filter === 'all' ? catalog : catalog.filter((p) => p.category === filter)),
    [filter, catalog],
  )

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="panel absolute left-3 top-1/2 z-20 flex h-24 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-300 hover:text-white"
        title="展开商品库"
      >
        <Icon name="chevron" className="rotate-180" size={18} />
      </button>
    )
  }

  return (
    <aside className="panel absolute left-3 top-16 bottom-3 z-20 flex w-[19rem] max-w-[85vw] flex-col rounded-2xl shadow-xl">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-100">商品库</h2>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          title="收起"
        >
          <Icon name="chevron" size={18} />
        </button>
      </div>

      {/* 分类 chips */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="全部" icon="cube" />
        {categories.map((c) => (
          <Chip
            key={c}
            active={filter === c}
            onClick={() => setFilter(c)}
            label={CATEGORY_META[c].label}
            icon={c}
          />
        ))}
      </div>

      {/* 商品列表 */}
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => addItem(p.id)}
            className="group flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition hover:border-brand-500/50 hover:bg-white/[0.07]"
            title={`点击添加「${p.name}」`}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/90"
              style={{ background: `${TILE_COLORS[p.category]}33`, color: TILE_COLORS[p.category] }}
            >
              <Icon name={p.category} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-100">{p.name}</span>
              <span className="block text-[11px] text-slate-400">
                {p.size.w}×{p.size.d}×{p.size.h} m
                {p.price != null && <span className="ml-2 text-amber-300/90">¥{p.price}</span>}
              </span>
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white opacity-80 transition group-hover:opacity-100">
              <Icon name="plus" size={16} />
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-white/5 px-4 py-2 text-[11px] text-slate-500">
        共 {products.length} 件 · 点击卡片放入房间
      </div>
    </aside>
  )
}

function Chip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: Parameters<typeof Icon>[0]['name']
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-white/[0.05] text-slate-300 hover:bg-white/10'
      }`}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  )
}
