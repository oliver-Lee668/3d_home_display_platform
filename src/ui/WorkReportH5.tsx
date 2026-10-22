import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiOrder, type ApiWorkReport } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * 车间报工（H5）：工人扫工单二维码领活、完工报数。
 * 数字工厂的执行层入口——工单打印出去只是"纸"，报工把执行读数闭环回系统。
 * 报工人由后端从登录 token 取，本页不收集也不展示可编辑的操作人。
 */
export function WorkReportH5() {
  const user = useAuth((s) => s.user)
  const [orderNo, setOrderNo] = useState(() => {
    const m = window.location.hash.match(/[?&]order=([^&]+)/)
    return m ? decodeURIComponent(m[1]) : ''
  })
  const [order, setOrder] = useState<ApiOrder | null>(null)
  const [reports, setReports] = useState<ApiWorkReport[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // 正在填写完工数的工单行下标
  const [editing, setEditing] = useState<number | null>(null)
  const [good, setGood] = useState('1')
  const [scrap, setScrap] = useState('0')

  const load = useCallback(async (no: string) => {
    setError('')
    const n = no.trim()
    if (!n) {
      setError('请先扫码或输入工单号')
      return
    }
    setBusy(true)
    try {
      const list = await api.listOrders()
      const hit = list.find((o) => o.orderNo === n)
      if (!hit) {
        setOrder(null)
        setReports([])
        setError('未找到该工单，请核对二维码或单号')
        return
      }
      setOrder(hit)
      setReports(await api.listReports(hit.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [])

  // 二维码带单号进来时自动加载一次
  useEffect(() => {
    if (orderNo) void load(orderNo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (itemIndex: number, action: 'start' | 'complete') => {
    if (!order) return
    setBusy(true)
    setError('')
    try {
      const res = await api.addReport({
        orderId: order.id,
        itemIndex,
        action,
        qtyGood: action === 'complete' ? Math.max(0, parseInt(good || '0', 10)) : undefined,
        qtyScrap: action === 'complete' ? Math.max(0, parseInt(scrap || '0', 10)) : undefined,
      })
      setReports(await api.listReports(order.id))
      setOrder({ ...order })
      setEditing(null)
      void res
      await load(order.orderNo)
    } catch (e) {
      setError(e instanceof Error ? e.message : '报工失败')
    } finally {
      setBusy(false)
    }
  }

  const progressOf = (itemIndex: number, planned: number) => {
    let g = 0
    let s = 0
    for (const r of reports) {
      if (r.itemIndex === itemIndex && r.action === 'complete') {
        g += r.qtyGood
        s += r.qtyScrap
      }
    }
    return { good: g, scrap: s, planned }
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-md bg-slate-950 px-4 py-4 text-slate-100">
      <header className="mb-4 flex items-center gap-2">
        <a href="#/" className="text-[12px] text-slate-400 underline-offset-2 hover:underline">
          ← 确认台
        </a>
        <h1 className="text-[16px] font-semibold">车间报工</h1>
        <span className="ml-auto text-[12px] text-slate-400">{user?.displayName ?? ''}</span>
      </header>

      <ScanBox
        onCode={(code) => {
          setOrderNo(code)
          void load(code)
        }}
      />

      <div className="mt-3 flex gap-2">
        <input
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          placeholder="工单号（如 SO20261013-0001）"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[13px] outline-none focus:border-brand-500"
        />
        <button
          onClick={() => void load(orderNo)}
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] text-white hover:bg-brand-500 disabled:opacity-50"
        >
          调出工单
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}

      {order && (
        <section className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium">{order.orderNo}</span>
            <span className="text-[11px] text-slate-400">{statusText(order.status)}</span>
          </div>
          {order.status !== 'in_production' ? (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
              该单当前不在生产中，无法报工。
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {order.items.map((it, i) => {
                const p = progressOf(i, it.qty)
                const done = p.good >= p.planned
                return (
                  <li key={i} className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px]">{it.name}</span>
                      <span className="ml-auto text-[11px] text-slate-400">
                        合格 {p.good}/{p.planned}
                        {p.scrap > 0 ? ` · 废 ${p.scrap}` : ''}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-white/10">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, (p.good / Math.max(1, p.planned)) * 100)}%` }}
                      />
                    </div>
                    {editing === i ? (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-[11px] text-slate-400">合格</label>
                        <input
                          value={good}
                          onChange={(e) => setGood(e.target.value)}
                          inputMode="numeric"
                          className="w-14 rounded border border-white/15 bg-black/40 px-2 py-1 text-[12px]"
                        />
                        <label className="text-[11px] text-slate-400">废品</label>
                        <input
                          value={scrap}
                          onChange={(e) => setScrap(e.target.value)}
                          inputMode="numeric"
                          className="w-14 rounded border border-white/15 bg-black/40 px-2 py-1 text-[12px]"
                        />
                        <button
                          onClick={() => void submit(i, 'complete')}
                          disabled={busy}
                          className="ml-auto rounded bg-emerald-600 px-3 py-1 text-[12px] text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          提交
                        </button>
                        <button onClick={() => setEditing(null)} className="text-[12px] text-slate-400">
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void submit(i, 'start')}
                          disabled={busy || done}
                          className="rounded border border-white/15 px-3 py-1 text-[12px] text-slate-200 hover:bg-white/10 disabled:opacity-40"
                        >
                          开工领活
                        </button>
                        <button
                          onClick={() => {
                            setEditing(i)
                            setGood('1')
                            setScrap('0')
                          }}
                          disabled={busy || done}
                          className="rounded bg-brand-600 px-3 py-1 text-[12px] text-white hover:bg-brand-500 disabled:opacity-40"
                        >
                          {done ? '已完工' : '完工报数'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <h2 className="mt-4 text-[12px] font-medium text-slate-300">本单报工流水</h2>
          <ul className="mt-1 space-y-1">
            {reports.length === 0 && <li className="text-[11px] text-slate-500">暂无报工记录</li>}
            {reports.map((r) => (
              <li key={r.id} className="flex gap-2 text-[11px] text-slate-400">
                <span className="shrink-0">{fmtTime(r.at)}</span>
                <span className={r.action === 'complete' ? 'text-emerald-400' : 'text-sky-400'}>
                  {r.action === 'complete' ? `完工 合格${r.qtyGood} 废${r.qtyScrap}` : '开工'}
                </span>
                <span className="truncate">{r.itemName}</span>
                <span className="ml-auto shrink-0">{r.worker}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** 接口时间为 RFC3339（DATETIME 按 UTC 存储），统一转本地时区展示 */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(5, 16).replace('T', ' ')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    submitted: '已下单 · 待销售确认',
    sales_confirmed: '待生产确认',
    in_production: '生产中',
    completed: '已完成',
    rejected: '已退回销售',
  }
  return map[status] ?? status
}

/** 扫码框：优先用浏览器原生 BarcodeDetector；不支持时退回手动输入 */
function ScanBox({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [hint, setHint] = useState('')

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => stop, [stop])

  const start = async () => {
    setHint('')
    const BD = (window as unknown as Record<string, unknown>).BarcodeDetector as
      | (new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> })
      | undefined
    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      setHint('当前浏览器不支持扫码（需 HTTPS 或 localhost + Chrome/Edge），请手动输入工单号')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setScanning(true)
      const det = new BD({ formats: ['qr_code'] })
      timerRef.current = window.setInterval(async () => {
        try {
          const codes = await det.detect(video)
          if (codes.length > 0) {
            stop()
            onCode(parseCode(codes[0].rawValue))
          }
        } catch {
          /* 单帧识别失败忽略 */
        }
      }, 400)
    } catch {
      setHint('无法打开摄像头，请手动输入工单号')
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (scanning ? stop() : void start())}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
        >
          {scanning ? '停止扫码' : '扫工单二维码'}
        </button>
        <span className="text-[11px] text-slate-500">二维码内容为本页地址 + 工单号</span>
      </div>
      <video ref={videoRef} muted playsInline className={`mt-2 w-full rounded-lg ${scanning ? '' : 'hidden'}`} />
      {hint && <p className="mt-2 text-[11px] text-amber-300">{hint}</p>}
    </div>
  )
}

/** 二维码里可能是完整 URL（#/report?order=XXX），也可能就是裸单号 */
function parseCode(raw: string): string {
  const m = raw.match(/[?&]order=([^&]+)/)
  if (m) return decodeURIComponent(m[1])
  return raw.trim()
}
