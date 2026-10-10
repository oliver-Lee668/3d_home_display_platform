import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { RoomConfig, WallOpening } from '../types'
import { getUserRooms } from '../data/rooms'
import { useSceneStore } from '../store/useSceneStore'
import { fileToImageDataUrl } from '../lib/image'
import { Icon } from './icons'

const WALL_LABEL: Record<WallOpening['wall'], string> = {
  north: '北墙 (−Z)',
  south: '南墙 (+Z)',
  west: '西墙 (−X)',
  east: '东墙 (+X)',
}

/** 将洞口参数钳制到房间边界内，丢弃非法项 */
function sanitizeOpenings(list: WallOpening[], w: number, d: number, h: number): WallOpening[] {
  const out: WallOpening[] = []
  for (const o of list) {
    const L = o.wall === 'north' || o.wall === 'south' ? w : d
    const width = Math.min(Math.max(0.3, o.width), Math.max(0.3, L - 0.4))
    const maxOff = Math.max(0, L / 2 - width / 2)
    const offset = Math.min(Math.max(o.offset, -maxOff), maxOff)
    const height = Math.min(Math.max(0.3, o.height), h - 0.1)
    const sill = Math.min(Math.max(0, o.sill), Math.max(0, h - height))
    out.push({ ...o, width, offset, height, sill })
  }
  return out
}

const DEFAULT_OPENINGS: WallOpening[] = [
  { wall: 'north', type: 'window', offset: 0, width: 1.5, height: 1.3, sill: 0.9 },
  { wall: 'south', type: 'door', offset: 1.0, width: 0.9, height: 2.05, sill: 0 },
]

/** 房间定制编辑器：照片参考 + 尺寸 + 门窗，生成可摆放家具的空房间 */
export function RoomEditor({ onClose }: { onClose: () => void }) {
  const createUserRoom = useSceneStore((s) => s.createUserRoom)
  const deleteUserRoom = useSceneStore((s) => s.deleteUserRoom)
  const setRoom = useSceneStore((s) => s.setRoom)
  const roomsVersion = useSceneStore((s) => s.roomsVersion)
  const notify = useSceneStore((s) => s.notify)

  const [name, setName] = useState('我的房间')
  const [w, setW] = useState(4)
  const [d, setD] = useState(3.5)
  const [h, setH] = useState(2.7)
  const [openings, setOpenings] = useState<WallOpening[]>(DEFAULT_OPENINGS)
  const [photo, setPhoto] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const userRooms = getUserRooms()
  void roomsVersion // 变更时触发重渲染以刷新下方列表

  const handlePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPhoto(await fileToImageDataUrl(file, 640))
    } catch {
      notify('照片读取失败，请重试')
    }
  }

  const addOpening = (type: 'window' | 'door') => {
    setOpenings((prev) => [
      ...prev,
      type === 'window'
        ? { wall: 'north', type, offset: 0, width: 1.2, height: 1.2, sill: 0.9 }
        : { wall: 'south', type, offset: 0, width: 0.9, height: 2.05, sill: 0 },
    ])
  }

  const updateOpening = (i: number, patch: Partial<WallOpening>) =>
    setOpenings((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const handleSave = () => {
    const cfg: RoomConfig = {
      id: `user_${Date.now().toString(36)}`,
      name: name.trim() || '我的房间',
      size: { w, d, height: h },
      floorColor: '#c9a882',
      wallColor: '#f2efe9',
      ceilingColor: '#fbfaf7',
      openings: sanitizeOpenings(openings, w, d, h),
      source: 'user',
      photo: photo ?? undefined,
    }
    createUserRoom(cfg)
    onClose()
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="panel flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="cube" className="text-brand-500" size={18} />
            <span className="text-sm font-semibold text-slate-100">定制我的房间</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" title="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* 参考照片 */}
          <section>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-400">
              参考照片（可选）
            </h3>
            <div className="flex items-start gap-3">
              <button
                onClick={() => photoRef.current?.click()}
                className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 text-slate-400 hover:bg-white/10"
              >
                {photo ? (
                  <img src={photo} alt="参考照片" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[11px]">
                    <Icon name="plus" size={16} />
                    上传照片
                  </span>
                )}
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              <div className="flex-1 text-[12px] leading-relaxed text-slate-400">
                <p>上传一张你屋子的照片作为摆放参考，它会显示在画布左下角。</p>
                <p className="mt-1 text-slate-500">
                  注意：单张照片无法自动推算真实尺寸，请在下方输入量得的长/宽/层高（可用卷尺或参照已知家具估算）。
                </p>
                {photo && (
                  <button
                    onClick={() => setPhoto(null)}
                    className="mt-2 rounded px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/15"
                  >
                    移除照片
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* 房间名称与尺寸 */}
          <section>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-400">名称与尺寸</h3>
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-400">房间名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500"
                placeholder="例如：我的客厅"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Slider label="长 (X)" value={w} min={2} max={12} step={0.1} unit="m" onChange={setW} />
              <Slider label="宽 (Z)" value={d} min={2} max={12} step={0.1} unit="m" onChange={setD} />
              <Slider label="层高 (Y)" value={h} min={2.2} max={4} step={0.05} unit="m" onChange={setH} />
            </div>
          </section>

          {/* 门窗洞口 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-slate-400">门 / 窗洞口</h3>
              <div className="flex gap-2">
                <SmallBtn onClick={() => addOpening('window')} icon="plus">
                  加窗
                </SmallBtn>
                <SmallBtn onClick={() => addOpening('door')} icon="plus">
                  加门
                </SmallBtn>
              </div>
            </div>
            {openings.length === 0 && (
              <p className="text-[12px] text-slate-500">暂无洞口，可添加门/窗。</p>
            )}
            <div className="space-y-2">
              {openings.map((o, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_auto_auto_auto_auto_auto_auto] items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2"
                >
                  <select
                    value={o.wall}
                    onChange={(e) => updateOpening(i, { wall: e.target.value as WallOpening['wall'] })}
                    className="rounded bg-black/40 px-1.5 py-1 text-[12px] text-slate-200 outline-none"
                  >
                    {(Object.keys(WALL_LABEL) as WallOpening['wall'][]).map((k) => (
                      <option key={k} value={k}>
                        {WALL_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-400">{o.type === 'window' ? '窗' : '门'}</span>
                  <Num label="偏移" value={o.offset} step={0.1} onChange={(v) => updateOpening(i, { offset: v })} />
                  <Num label="宽" value={o.width} step={0.1} min={0.3} onChange={(v) => updateOpening(i, { width: v })} />
                  <Num label="高" value={o.height} step={0.05} min={0.3} onChange={(v) => updateOpening(i, { height: v })} />
                  <Num label="离地" value={o.sill} step={0.05} min={0} onChange={(v) => updateOpening(i, { sill: v })} />
                  <button
                    onClick={() => setOpenings((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded p-1 text-rose-300 hover:bg-rose-500/15"
                    title="删除"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              偏移＝洞口中心相对墙面中点的水平距离（米）；离地＝底边高度。保存时会自动钳制到墙内。
            </p>
          </section>

          {/* 已保存的自定义房间 */}
          {userRooms.length > 0 && (
            <section>
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-400">
                已保存的自定义房间
              </h3>
              <div className="flex flex-wrap gap-2">
                {userRooms.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 py-1 pl-2 pr-1"
                  >
                    <button
                      onClick={() => {
                        setRoom(r.id)
                        onClose()
                      }}
                      className="text-[12px] text-slate-200 hover:text-brand-400"
                    >
                      {r.name}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`删除自定义房间「${r.name}」？`)) deleteUserRoom(r.id)
                      }}
                      className="rounded p-1 text-rose-300 hover:bg-rose-500/15"
                      title="删除"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] text-slate-300 hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-500"
          >
            生成房间
          </button>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[11px] text-slate-400">{label}</label>
        <span className="text-[11px] text-slate-300">
          {value.toFixed(2)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </div>
  )
}

function Num({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-400">
      {label}
      <input
        type="number"
        value={Number(value.toFixed(2))}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded bg-black/40 px-1.5 py-1 text-[12px] text-slate-100 outline-none focus:border-brand-500"
      />
    </label>
  )
}

function SmallBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: 'plus'
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
    >
      <Icon name={icon} size={12} />
      {children}
    </button>
  )
}
