import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Category, Product, ProductSpec } from '../types'
import { BUILTIN_CATALOG, CATEGORY_META, CATEGORY_ORDER } from '../data/catalog'
import { entryIds, useCatalogStore } from '../store/useCatalogStore'
import type { ApiCatalogEntry } from '../lib/api'
import { SpecEditor } from './SpecEditor'
import { useFlash } from './useFlash'

/** 新增商品表单初值 */
const EMPTY_FORM = {
  name: '',
  category: 'sofa' as Category,
  w: '1.2',
  h: '0.8',
  d: '0.8',
  price: '999',
}

const MODEL_EXT = '.glb,.gltf'

/** 商品库管理（销售端）：上传替换模型 / 改价 / 规格主数据 / 新增 / 下架 */
export function CatalogManager() {
  const products = useCatalogStore((s) => s.products)
  const entries = useCatalogStore((s) => s.entries)
  const disabledProducts = useCatalogStore((s) => s.disabledProducts)
  const overriddenProducts = useCatalogStore((s) => s.overriddenProducts)
  const customProducts = useCatalogStore((s) => s.customProducts)
  const busy = useCatalogStore((s) => s.busy)
  const error = useCatalogStore((s) => s.error)
  const saveEntry = useCatalogStore((s) => s.saveEntry)
  const removeEntry = useCatalogStore((s) => s.removeEntry)
  const upload = useCatalogStore((s) => s.upload)

  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [priceId, setPriceId] = useState<string | null>(null)
  const [priceVal, setPriceVal] = useState('')
  const [specId, setSpecId] = useState<string | null>(null)
  const { msg, setMsg, flash } = useFlash()
  const [working, setWorking] = useState(false)
  const replaceRef = useRef<HTMLInputElement>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<string | null>(null)
  const addFile = useRef<File | null>(null)

  /** 已下架的内置商品也要列出来，便于恢复 */
  const rows = useMemo(() => {
    const disabledBuiltins = BUILTIN_CATALOG.filter((p) => disabledProducts.includes(p.id))
    return [...disabledBuiltins, ...products]
  }, [products, disabledProducts])

  /** 取某商品已有的 override 负载，保证多次修改可叠加 */
  const patchOf = (id: string): Record<string, unknown> => {
    const e = entries.find((x) => x.entryId === entryIds.productOverride(id))
    return e?.payload ? { ...(e.payload as Record<string, unknown>) } : { id }
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setWorking(true)
    setMsg(null)
    try {
      await fn()
      flash(`${label}成功`)
    } catch (e) {
      flash(`${label}失败：${e instanceof Error ? e.message : String(e)}`, 8000)
    } finally {
      setWorking(false)
    }
  }

  const onReplacePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const id = replaceTarget.current
    replaceTarget.current = null
    if (!file || !id) return
    void run('替换模型', async () => {
      const url = await upload(file)
      await saveEntry(entryIds.productOverride(id), 'product_override', {
        ...patchOf(id),
        id,
        model: { kind: 'gltf', ref: url },
      })
    })
  }

  const startReplace = (id: string) => {
    replaceTarget.current = id
    replaceRef.current?.click()
  }

  const savePrice = (id: string) => {
    const price = Number(priceVal)
    if (!Number.isFinite(price) || price < 0) {
      flash('价格需为非负数字', 6000)
      return
    }
    setPriceId(null)
    void run('改价', () =>
      saveEntry(entryIds.productOverride(id), 'product_override', { ...patchOf(id), id, price }),
    )
  }

  /** 上传商品的整体负载（保存规格时需保留其余字段） */
  const customOf = (id: string): Product | undefined => {
    const e = entries.find((x) => x.entryId === entryIds.productCustom(id))
    return e?.payload ? (e.payload as Product) : undefined
  }

  /**
   * 保存规格主数据：
   * - 内置商品→写入 override 条目（与改模型/改价叠加）
   * - 销售上传商品→直接更新 custom 条目整体负载
   */
  const saveSpec = async (p: Product, spec: ProductSpec): Promise<void> => {
    setSpecId(null)
    if (isCustom(p.id)) {
      const base = customOf(p.id)
      if (!base) return flash('保存规格失败：未找到上传商品数据', 6000)
      return run('保存规格', () =>
        saveEntry(entryIds.productCustom(p.id), 'product_custom', { ...base, spec }),
      )
    }
    return run('保存规格', () =>
      saveEntry(entryIds.productOverride(p.id), 'product_override', { ...patchOf(p.id), id: p.id, spec }),
    )
  }

  const onAddPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFile.current = e.target.files?.[0] ?? null
    e.target.value = ''
  }

  const submitAdd = () => {
    const name = form.name.trim()
    const file = addFile.current
    if (!name) return flash('请填写商品名称', 6000)
    if (!file) return flash('请上传 glTF/GLB 模型文件', 6000)
    const w = Number(form.w)
    const h = Number(form.h)
    const d = Number(form.d)
    const price = Number(form.price)
    if (![w, h, d].every((n) => Number.isFinite(n) && n > 0)) return flash('尺寸需为大于 0 的数字', 6000)
    if (!Number.isFinite(price) || price < 0) return flash('价格需为非负数字', 6000)

    void run('新增商品', async () => {
      const url = await upload(file)
      const id = `custom_${Date.now().toString(36)}`
      const product: Product = {
        id,
        name,
        category: form.category,
        size: { w, h, d },
        model: { kind: 'gltf', ref: url },
        defaultMaterialId: 'default',
        materials: [{ id: 'default', label: '默认材质', color: '#b9bcc0', roughness: 0.7 }],
        price,
        description: '销售端上传商品',
      }
      await saveEntry(entryIds.productCustom(id), 'product_custom', product)
      setAddOpen(false)
      setForm({ ...EMPTY_FORM })
      addFile.current = null
    })
  }

  const modelDesc = (p: Product) => {
    if (p.model.kind === 'procedural') return `程序化 · ${p.model.ref}`
    const ref = p.model.ref
    return ref.includes('/uploads/') ? `上传模型 · ${ref.split('/').pop()}` : `内置模型 · ${ref.split('/').pop()}`
  }

  const tag = (p: Product) => {
    if (disabledProducts.includes(p.id)) return { text: '已下架', cls: 'bg-rose-500/15 text-rose-300' }
    if (customProducts.includes(p.id)) return { text: '销售上传', cls: 'bg-emerald-500/15 text-emerald-300' }
    if (overriddenProducts.includes(p.id)) return { text: '已替换', cls: 'bg-amber-500/15 text-amber-300' }
    return { text: '内置', cls: 'bg-white/10 text-slate-400' }
  }

  const isDisabled = (id: string) => disabledProducts.includes(id)
  const isCustom = (id: string) => customProducts.includes(id)
  const entryOf = (id: string): ApiCatalogEntry | undefined =>
    entries.find((e) => e.entryId === entryIds.productOverride(id))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] text-white hover:bg-brand-500"
        >
          {addOpen ? '收起' : '+ 新增商品（上传模型）'}
        </button>
        <span className="text-[11px] text-slate-500">
          共 {rows.length} 件 · 修改后用户端刷新即生效
        </span>
      </div>

      {(msg || error) && (
        <div
          className={`rounded-lg px-3 py-2 text-[12px] ${
            msg?.includes('失败') || error
              ? 'bg-rose-500/10 text-rose-300'
              : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {msg ?? error}
        </div>
      )}

      {addOpen && (
        <div className="panel rounded-xl p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="col-span-2 text-[11px] text-slate-400 sm:col-span-1">
              商品名称
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100"
                placeholder="如：布艺单人沙发"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              分类
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100"
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              价格(元)
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100"
                inputMode="numeric"
              />
            </label>
            {(['w', 'h', 'd'] as const).map((k) => (
              <label key={k} className="text-[11px] text-slate-400">
                {k === 'w' ? '宽' : k === 'h' ? '高' : '深'}(m)
                <input
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100"
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => addFileRef.current?.click()}
              className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/5"
            >
              {addFile.current ? addFile.current.name : '选择 glTF/GLB 模型'}
            </button>
            <button
              onClick={submitAdd}
              disabled={working}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              保存并上传
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            模型会按填写的尺寸等比缩放并底面对齐；建议使用 .glb 单文件、含贴图。
          </p>
          <input ref={addFileRef} type="file" accept={MODEL_EXT} className="hidden" onChange={onAddPick} />
        </div>
      )}

      <div className="space-y-2">
        {rows.map((p) => {
          const t = tag(p)
          const off = isDisabled(p.id)
          return (
            <div
              key={p.id}
              className={`panel rounded-xl p-3 ${off ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-slate-100">{p.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${t.cls}`}>{t.text}</span>
                <span className="text-[11px] text-slate-500">
                  {CATEGORY_META[p.category].label} · {p.size.w}×{p.size.d}×{p.size.h}m ·{' '}
                  {modelDesc(p)}
                </span>
                <span className="ml-auto text-[13px] text-amber-300">¥{p.price ?? 0}</span>
              </div>

              {p.spec && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  <span>型号 {p.spec.sku || '未编码'}</span>
                  <span>工时 {p.spec.laborMinutes ? `${p.spec.laborMinutes} 分/件` : '未填'}</span>
                  <span>
                    定制范围{' '}
                    {p.spec.scaleMin || p.spec.scaleMax
                      ? `×${p.spec.scaleMin ?? '不限'} ~ ×${p.spec.scaleMax ?? '不限'}`
                      : '未限定'}
                  </span>
                  <span>图纸 {p.spec.drawings?.length ?? 0} 份</span>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {!isCustom(p.id) && (
                  <>
                    <Btn disabled={working || off} onClick={() => startReplace(p.id)}>
                      替换模型
                    </Btn>
                    {priceId === p.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={priceVal}
                          onChange={(e) => setPriceVal(e.target.value)}
                          className="w-20 rounded border border-white/15 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100"
                          inputMode="numeric"
                        />
                        <Btn disabled={working} onClick={() => savePrice(p.id)}>
                          保存
                        </Btn>
                        <Btn onClick={() => setPriceId(null)}>取消</Btn>
                      </span>
                    ) : (
                      <Btn
                        disabled={working || off}
                        onClick={() => {
                          setPriceId(p.id)
                          setPriceVal(String(p.price ?? 0))
                        }}
                      >
                        改价
                      </Btn>
                    )}
                    {entryOf(p.id) && (
                      <Btn
                        disabled={working}
                        onClick={() =>
                          void run('还原内置', () => removeEntry(entryIds.productOverride(p.id)))
                        }
                      >
                        还原内置
                      </Btn>
                    )}
                    {off ? (
                      <Btn
                        disabled={working}
                        onClick={() => void run('恢复上架', () => removeEntry(entryIds.productDisable(p.id)))}
                      >
                        恢复上架
                      </Btn>
                    ) : (
                      <Btn
                        disabled={working}
                        onClick={() =>
                          void run('下架', () => saveEntry(entryIds.productDisable(p.id), 'product_disable'))
                        }
                      >
                        下架
                      </Btn>
                    )}
                  </>
                )}
                {isCustom(p.id) && (
                  <Btn
                    disabled={working}
                    onClick={() => void run('删除', () => removeEntry(entryIds.productCustom(p.id)))}
                  >
                    删除商品
                  </Btn>
                )}
                <Btn
                  disabled={working}
                  onClick={() => {
                    setMsg(null)
                    setSpecId(specId === p.id ? null : p.id)
                  }}
                >
                  {specId === p.id ? '收起规格' : '规格/图纸'}
                </Btn>
                {busy === entryIds.productOverride(p.id) && (
                  <span className="text-slate-500">处理中…</span>
                )}
              </div>

              {specId === p.id && (
                <SpecEditor
                  product={p}
                  working={working}
                  onSave={(spec) => saveSpec(p, spec)}
                  onCancel={() => setSpecId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      <input
        ref={replaceRef}
        type="file"
        accept={MODEL_EXT}
        className="hidden"
        onChange={onReplacePick}
      />
    </div>
  )
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
