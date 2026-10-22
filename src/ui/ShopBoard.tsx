import { useEffect, useState } from 'react'
import { api, type ApiDashboard } from '../lib/api'

const POLL_MS = 8000

/** 接口时间为 RFC3339（DATETIME 按 UTC 存储），统一转本地时区展示 */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(5, 16).replace('T', ' ')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 车间看板：挂在车间大屏上的"管理层读数"。
 * 数据全部来自 GET /api/dashboard 的服务端聚合（在制/今日报工/车间分组/流水），
 * 前端只做展示与轮询，不做任何本地计算，保证多块屏读数一致。
 */
export function ShopBoard() {
  const [data, setData] = useState<ApiDashboard | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const d = await api.dashboard()
        if (alive) {
          setData(d)
          setError('')
          setNow(new Date())
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '看板数据加载失败')
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])

  return (
    <div className="flex min-h-full flex-col bg-slate-950 px-6 py-5 text-slate-100">
      <header className="flex items-baseline gap-4">
        <h1 className="text-[26px] font-bold tracking-wide">
          车间生产看板
        </h1>
        <span className="text-[13px] text-slate-400">
          {now.toLocaleDateString('zh-CN')} {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <a href="#/" className="ml-auto text-[13px] text-slate-400 underline-offset-2 hover:underline">
          ← 返回确认台
        </a>
      </header>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}（每 {POLL_MS / 1000} 秒自动重试）
        </p>
      )}

      {!data && !error && <p className="mt-6 text-[14px] text-slate-500">加载中…</p>}

      {data && (
        <>
          {/* 顶部读数卡片 */}
          <section className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="在制订单" value={data.inProduction} unit="单" sub={`${data.inProductionPieces} 件在产`} accent="text-sky-400" />
            <Card label="今日合格" value={data.todayGood} unit="件" sub={`报工 ${data.todayReports} 次`} accent="text-emerald-400" />
            <Card label="今日废品" value={data.todayScrap} unit="件" sub={scrapRate(data)} accent="text-rose-400" />
            <Card label="今日折算工时" value={data.todayLaborMinutes} unit="分钟" sub={`退回中 ${data.rejected} 单`} accent="text-amber-400" />
          </section>

          {/* 车间分组进度 */}
          <section className="mt-5">
            <h2 className="text-[15px] font-medium text-slate-300">车间分组（在制订单）</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-white/5 text-[12px] text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-normal">车间</th>
                    <th className="px-4 py-2 font-normal">订单</th>
                    <th className="px-4 py-2 font-normal">计划件数</th>
                    <th className="px-4 py-2 font-normal">合格</th>
                    <th className="px-4 py-2 font-normal">废品</th>
                    <th className="px-4 py-2 font-normal">标准工时(分)</th>
                    <th className="w-[30%] px-4 py-2 font-normal">完工进度</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workshops.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        当前没有在制订单
                      </td>
                    </tr>
                  )}
                  {data.workshops.map((w) => (
                    <tr key={w.workshop} className="border-t border-white/5">
                      <td className="px-4 py-2.5 font-medium">{w.workshop}</td>
                      <td className="px-4 py-2.5">{w.orders}</td>
                      <td className="px-4 py-2.5">{w.pieces}</td>
                      <td className="px-4 py-2.5 text-emerald-400">{w.good}</td>
                      <td className="px-4 py-2.5 text-rose-400">{w.scrap}</td>
                      <td className="px-4 py-2.5">{w.laborMinutes}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded bg-white/10">
                            <div
                              className="h-full rounded bg-emerald-500 transition-all"
                              style={{ width: `${Math.min(100, Math.round(w.progress * 100))}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-[12px] text-slate-400">
                            {Math.round(w.progress * 100)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 最近报工流水 */}
          <section className="mt-5 flex-1">
            <h2 className="text-[15px] font-medium text-slate-300">最近报工</h2>
            <ul className="mt-2 space-y-1.5">
              {data.recent.length === 0 && <li className="text-[13px] text-slate-500">今天还没有报工记录</li>}
              {data.recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2 text-[13px]"
                >
                  <span className="text-slate-500">{fmtTime(r.at)}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                      r.action === 'complete' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    {r.action === 'complete' ? '完工' : '开工'}
                  </span>
                  <span className="text-slate-300">{r.orderNo}</span>
                  <span className="truncate text-slate-400">{r.itemName}</span>
                  {r.action === 'complete' && (
                    <span className="shrink-0 text-[12px]">
                      <span className="text-emerald-400">合格 {r.qtyGood}</span>
                      {r.qtyScrap > 0 && <span className="ml-2 text-rose-400">废 {r.qtyScrap}</span>}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[12px] text-slate-500">{r.worker}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function Card({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string
  value: number
  unit: string
  sub: string
  accent: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <p className="text-[12px] text-slate-400">{label}</p>
      <p className={`mt-1 text-[34px] font-bold leading-none ${accent}`}>
        {value}
        <span className="ml-1 text-[13px] font-normal text-slate-400">{unit}</span>
      </p>
      <p className="mt-2 text-[11px] text-slate-500">{sub}</p>
    </div>
  )
}

/** 今日废品率：合格+废品为 0 时不显示 */
function scrapRate(d: ApiDashboard): string {
  const total = d.todayGood + d.todayScrap
  if (total === 0) return '今日尚无完工报数'
  return `废品率 ${((d.todayScrap / total) * 100).toFixed(1)}%`
}
