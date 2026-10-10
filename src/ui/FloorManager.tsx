import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { BUILTIN_FLOORS } from '../data/floors'
import { entryIds, useCatalogStore } from '../store/useCatalogStore'

/** 地板管理（销售端）：上传新地板 / 下架内置地板 / 删除已上传地板 */
export function FloorManager() {
  const floors = useCatalogStore((s) => s.floors)
  const customFloors = useCatalogStore((s) => s.customFloors)
  const disabledFloors = useCatalogStore((s) => s.disabledFloors)
  const busy = useCatalogStore((s) => s.busy)
  const error = useCatalogStore((s) => s.error)
  const saveEntry = useCatalogStore((s) => s.saveEntry)
  const removeEntry = useCatalogStore((s) => s.removeEntry)
  const upload = useCatalogStore((s) => s.upload)

  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 含已下架的内置地板，便于恢复 */
  const rows = useMemo(() => {
    const disabledBuiltins = BUILTIN_FLOORS.filter((f) => disabledFloors.includes(f.id))
    return [...disabledBuiltins, ...floors]
  }, [floors, disabledFloors])

  const run = async (text: string, fn: () => Promise<unknown>) => {
    setWorking(true)
    setMsg(null)
    try {
      await fn()
      setMsg(`${text}成功`)
    } catch (e) {
      setMsg(`${text}失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWorking(false)
    }
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  const submit = () => {
    const name = label.trim()
    if (!name) return setMsg('请填写地板名称')
    if (!file) return setMsg('请选择地板贴图（png/jpg/webp）')
    void run('上传地板', async () => {
      const url = await upload(file)
      const id = `floor_${Date.now().toString(36)}`
      await saveEntry(entryIds.floorCustom(id), 'floor_custom', {
        id,
        label: name,
        kind: 'custom',
        baseColor: '#ffffff',
        swatch: '#8a8f98',
        image: url,
      })
      setLabel('')
      setFile(null)
    })
  }

  return (
    <div className="space-y-3">
      <div className="panel rounded-xl p-3">
        <div className="text-[12px] font-medium text-slate-200">上传新地板</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="地板名称，如：鱼骨拼橡木地板"
            className="w-56 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-100"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/5"
          >
            {file ? file.name : '选择贴图'}
          </button>
          <button
            onClick={submit}
            disabled={working}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            保存并上传
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          建议使用可平铺（seamless）的方形贴图，用户端会按房间尺寸自动平铺。
        </p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((f) => {
          const off = disabledFloors.includes(f.id)
          const custom = customFloors.includes(f.id)
          return (
            <div key={f.id} className={`panel rounded-xl p-3 ${off ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                {f.image ? (
                  <img src={f.image} alt={f.label} className="h-9 w-9 rounded object-cover" />
                ) : (
                  <span className="h-9 w-9 rounded" style={{ background: f.swatch }} />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-slate-100">{f.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {custom ? '销售上传' : '内置'} · {f.kind}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                {custom ? (
                  <button
                    disabled={working}
                    onClick={() => void run('删除', () => removeEntry(entryIds.floorCustom(f.id)))}
                    className="rounded-lg border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10 disabled:opacity-40"
                  >
                    删除
                  </button>
                ) : off ? (
                  <button
                    disabled={working}
                    onClick={() => void run('恢复', () => removeEntry(entryIds.floorDisable(f.id)))}
                    className="rounded-lg border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10 disabled:opacity-40"
                  >
                    恢复上架
                  </button>
                ) : (
                  <button
                    disabled={working}
                    onClick={() =>
                      void run('下架', () => saveEntry(entryIds.floorDisable(f.id), 'floor_disable'))
                    }
                    className="rounded-lg border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10 disabled:opacity-40"
                  >
                    下架
                  </button>
                )}
                {busy === entryIds.floorDisable(f.id) && <span className="text-slate-500">处理中…</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
