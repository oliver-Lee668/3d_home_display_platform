import { useCallback, useEffect, useState } from 'react'
import { api, type ApiOrder } from '../lib/api'
import { getLastPhone, statusColor, statusLabel } from '../lib/order'
import { Icon } from './icons'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 我的订单：按手机号查询订单与生产进度 */
export function MyOrders({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState(getLastPhone())
  const [orders, setOrders] = useState<ApiOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: string) => {
    if (!p.trim()) {
      setOrders([])
      return
    }
    try {
      setOrders(await api.listOrders({ phone: p.trim() }))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败')
      setOrders(null)
    }
  }, [])

  useEffect(() => {
    void load(phone)
  }, [phone, load])

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="panel flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="load" className="text-brand-500" size={18} />
            <span className="text-sm font-semibold text-slate-100">我的订单</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" title="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="输入下单手机号查询"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500"
          />
          <button
            onClick={() => void load(phone)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
          >
            刷新
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>}
          {!error && orders === null && <p className="text-[12px] text-slate-500">加载中…</p>}
          {!error && orders !== null && orders.length === 0 && (
            <p className="text-[12px] text-slate-500">暂无订单。先在场景中摆放家具并「确认下单」。</p>
          )}
          {orders?.map((o) => (
            <div key={o.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-100">{o.orderNo}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ color: statusColor(o.status), background: statusColor(o.status) + '22' }}
                >
                  {statusLabel(o.status)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px] text-slate-400">
                <span>
                  {o.room.roomName} · {o.room.sizeW}×{o.room.sizeD}×{o.room.sizeH}m · {o.room.floorLabel}
                </span>
                <span className="text-amber-300">¥{o.totalAmount.toFixed(2)}</span>
              </div>
              <div className="mt-1 text-[12px] text-slate-400">
                {o.items.map((it) => `${it.name}×${it.qty}`).join('、')}
              </div>
              {/* 进度时间线 */}
              <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                {o.history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: statusColor(h.status) }}
                    />
                    <span className="text-slate-300">{statusLabel(h.status)}</span>
                    <span>· {h.by}</span>
                    <span>· {fmtTime(h.at)}</span>
                    {h.note && <span className="text-slate-600">· {h.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
