import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiOrder } from '../lib/api'
import { getLastOrderNo, getLastPhone, statusColor, statusLabel } from '../lib/order'
import { Icon } from './icons'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 我的订单：订单号 + 手机号双因子自助查单。
 *
 * 客户端不做注册登录，但只凭手机号就能查单等于把别人的订单交给撞库：
 * 手机号只有 11 位且可枚举。加上订单号后两个因子必须同时命中，
 * 且后端对"订单不存在"与"手机号不匹配"返回同一文案，无法拿订单号探人。
 */
export function MyOrders({ onClose }: { onClose: () => void }) {
  const [orderNo, setOrderNo] = useState(getLastOrderNo())
  const [phone, setPhone] = useState(getLastPhone())
  const [orders, setOrders] = useState<ApiOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 只在首次挂载时用已记住的凭据自动查一次，之后必须点「查询」（避免边输边打接口）
  const autoQueried = useRef(false)

  const load = useCallback(async (no: string, p: string) => {
    const n = no.trim()
    const ph = p.trim()
    if (!n || !ph) {
      setError('请同时填写订单号与下单手机号')
      setOrders(null)
      return
    }
    setBusy(true)
    try {
      setOrders(await api.lookupOrders(n, ph))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败')
      setOrders(null)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (autoQueried.current) return
    autoQueried.current = true
    if (orderNo.trim() && phone.trim()) void load(orderNo, phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inputCls =
    'flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500'

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

        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="订单号（下单成功页可看到）"
              className={inputCls}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="下单手机号"
              className={inputCls}
            />
            <button
              onClick={() => void load(orderNo, phone)}
              disabled={busy}
              className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? '查询中…' : '查询'}
            </button>
          </div>
          <p className="text-[11px] text-slate-600">
            为保障客户隐私，需同时提供订单号与下单手机号才能查看进度。
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>}
          {!error && orders === null && (
            <p className="text-[12px] text-slate-500">填写订单号与手机号后点「查询」。</p>
          )}
          {!error && orders !== null && orders.length === 0 && (
            <p className="text-[12px] text-slate-500">未查到订单。请核对订单号与手机号是否一致。</p>
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
