import { useEffect, useState, type ReactNode } from 'react'
import { api, type ApiDrawing, type ApiOrder, type ApiOrderItem, type ApiWorkReport } from '../lib/api'
import { groupWorkOrder, laborText, orderToCsv, sizeText, workOrderTotals } from '../lib/order'
import { downloadText } from '../lib/export'

/** 是否为非标定制（改过尺寸） */
function isCustomSize(it: ApiOrderItem): boolean {
  return Math.abs(it.scale - 1) > 1e-6
}

function exportCsv(order: ApiOrder) {
  downloadText(`工单_${order.orderNo}.csv`, orderToCsv(order), 'text/csv;charset=utf-8')
}

/**
 * 下载图纸。
 *
 * 图纸（PDF/DWG/STEP 等）属商业机密，后端按扩展名鉴权，未登录一律 401。
 * 而 <a download> 发起的是浏览器导航请求，带不上 Authorization 头，
 * 所以这里必须走 fetch 拿 blob 再触发下载（已封装在 api.downloadDrawing）。
 */
async function saveDrawing(d: ApiDrawing) {
  try {
    await api.downloadDrawing(d.url, d.name)
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '图纸下载失败')
  }
}

/** 报工二维码内容：生产端 H5 报工页地址 + 单号（工人扫码直达本单） */
function reportUrl(orderNo: string): string {
  return `${window.location.origin}${window.location.pathname}#/report?order=${encodeURIComponent(orderNo)}`
}

/** 生成二维码 dataURL（面板展示与打印纸样共用）。
 *  qrcode 库走动态 import：只有生产端真正渲染工单时才加载，
 *  销售端虽然也打包了 WorkOrder 但不会下载这块代码。 */
function useReportQr(orderNo: string): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(reportUrl(orderNo), { width: 320, margin: 1 }))
      .then((d) => {
        if (alive) setUrl(d)
      })
      .catch(() => {
        /* 生成失败仅不展示二维码，不影响工单其余内容 */
      })
    return () => {
      alive = false
    }
  }, [orderNo])
  return url
}

/** 拉取本单报工流水，按工单行汇总合格/废品（下标对齐 order.items） */
function useItemProgress(order: ApiOrder): Map<number, { good: number; scrap: number }> {
  const [map, setMap] = useState<Map<number, { good: number; scrap: number }>>(new Map())
  const orderId = order.id
  useEffect(() => {
    let alive = true
    api
      .listReports(orderId)
      .then((reports: ApiWorkReport[]) => {
        if (!alive) return
        const m = new Map<number, { good: number; scrap: number }>()
        for (const r of reports) {
          if (r.action !== 'complete') continue
          const prev = m.get(r.itemIndex) ?? { good: 0, scrap: 0 }
          prev.good += r.qtyGood
          prev.scrap += r.qtyScrap
          m.set(r.itemIndex, prev)
        }
        setMap(m)
      })
      .catch(() => {
        /* 无报工记录或服务不可用时保持空表 */
      })
    return () => {
      alive = false
    }
  }, [orderId])
  return map
}

/**
 * 生产工单面板（嵌在订单卡片内）。
 * 按车间拆单分组，展示规格快照：型号、定制后毫米尺寸、材质色号、工艺、包装、工时、图纸与三视图。
 */
export function WorkOrderPanel({ order, onPrint }: { order: ApiOrder; onPrint: () => void }) {
  const groups = groupWorkOrder(order.items)
  const totals = workOrderTotals(order.items)
  const noSpec = order.items.every((it) => !it.spec)
  const qr = useReportQr(order.orderNo)
  // 分组保留了原 items 的对象引用，用 Map 反查行下标对齐报工进度
  const indexByItem = new Map<ApiOrderItem, number>(order.items.map((it, i) => [it, i]))
  const progress = useItemProgress(order)

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-slate-200">生产工单</span>
        <span className="text-[11px] text-slate-500">
          {groups.length} 个车间 · {totals.pieces} 件 · 工时合计 {laborText(totals.laborMinutes)}
        </span>
        {qr && (
          <img
            src={qr}
            alt="扫码报工二维码"
            title="工人扫码进入 H5 报工页"
            className="h-14 w-14 rounded border border-white/20 bg-white p-0.5"
          />
        )}
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => exportCsv(order)}
            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
          >
            导出 CSV
          </button>
          <button
            onClick={onPrint}
            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
          >
            打印工单
          </button>
        </div>
      </div>

      {noSpec && (
        <p className="mt-2 text-[11px] text-amber-300">
          该订单为规格快照上线前创建，缺少型号/尺寸/工艺信息，请联系销售补充后再排产。
        </p>
      )}

      <div className="mt-2 space-y-3">
        {groups.map((g) => (
          <div key={g.group} className="rounded-lg border border-white/10 p-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-200">
                {g.group}车间
              </span>
              <span className="text-[11px] text-slate-500">
                {g.items.length} 项 · {g.pieces} 件 · {laborText(g.laborMinutes)}
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {g.items.map((it, i) => {
                const s = it.spec
                const p = progress.get(indexByItem.get(it) ?? -1)
                return (
                  <div key={i} className="rounded-lg bg-white/[0.03] p-2">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="font-medium text-slate-100">{it.name}</span>
                      <span className="text-slate-500">型号 {s?.sku || '未编码'}</span>
                      <span className="text-slate-300">×{it.qty}</span>
                      {isCustomSize(it) && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                          非标 ×{it.scale.toFixed(2)}
                        </span>
                      )}
                      {p && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            p.good >= it.qty ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          报工 合格 {p.good}/{it.qty}
                          {p.scrap > 0 ? ` · 废 ${p.scrap}` : ''}
                        </span>
                      )}
                      {s && (
                        <span className="ml-auto text-[11px] text-slate-400">
                          工时 {s.laborMinutes ?? 0} 分/件 · 小计{' '}
                          {laborText((s.laborMinutes ?? 0) * it.qty)}
                        </span>
                      )}
                    </div>

                    {s ? (
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                        <Field k="实际尺寸(宽×深×高)" v={`${sizeText(it)} mm`} />
                        <Field
                          k="标准尺寸"
                          v={`${Math.round(s.baseSizeW * 1000)}×${Math.round(s.baseSizeD * 1000)}×${Math.round(s.baseSizeH * 1000)} mm`}
                        />
                        <Field k="分类" v={s.category || '—'} />
                        <Field
                          k="材质"
                          v={
                            <span className="flex items-center gap-1">
                              {s.colorCode && (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                  style={{ background: s.colorCode }}
                                />
                              )}
                              {it.materialLabel}
                              {s.colorCode ? ` (${s.colorCode})` : ''}
                            </span>
                          }
                        />
                        <Field k="主材 SKU" v={s.materialSku || '—'} />
                        <Field k="包装" v={s.packing || '—'} />
                        <Field k="工艺要求" v={s.craft || '—'} wide />
                        <Field
                          k="定制可行域"
                          v={
                            s.scaleMin || s.scaleMax
                              ? `×${s.scaleMin ?? '不限'} ~ ×${s.scaleMax ?? '不限'}`
                              : '未限定'
                          }
                        />
                      </dl>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {it.materialLabel}
                        {isCustomSize(it) ? ` · 缩放 ${it.scale.toFixed(2)}` : ''} · 无规格快照
                      </p>
                    )}

                    {s?.drawings && s.drawings.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-slate-500">图纸：</span>
                        {s.drawings.map((d, k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => void saveDrawing(d)}
                            className="rounded bg-white/5 px-1.5 py-0.5 text-brand-400 hover:bg-white/10"
                          >
                            ↓ {d.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {s?.views && (
                      <img
                        src={s.views}
                        alt={`${it.name} 三视图`}
                        className="mt-2 w-full max-w-[560px] rounded border border-white/10 bg-white"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ k, v, wide }: { k: string; v: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-200">{v}</dd>
    </div>
  )
}

/**
 * 打印用工单纸样（浅色）：先预览再手动打印，
 * 通过 index.css 的 @media print 规则只打印 .print-area 区域。
 */
export function WorkOrderSheet({ order, onClose }: { order: ApiOrder; onClose: () => void }) {
  const groups = groupWorkOrder(order.items)
  const totals = workOrderTotals(order.items)
  const qr = useReportQr(order.orderNo)

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/70 p-4">
      <div className="no-print mx-auto mb-3 flex w-[900px] max-w-full items-center gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] text-white hover:bg-brand-500"
        >
          打印 / 另存 PDF
        </button>
        <button
          onClick={() => exportCsv(order)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
        >
          导出 CSV
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
        >
          关闭
        </button>
      </div>

      <div className="print-area mx-auto w-[900px] max-w-full bg-white p-6 text-[12px] text-slate-900">
        <div className="flex items-end justify-between border-b-2 border-slate-900 pb-2">
          <div>
            <h1 className="text-[20px] font-bold">生产工单</h1>
            <p className="mt-1 text-[12px] text-slate-600">
              订单号 {order.orderNo} · 打印于 {new Date().toLocaleString('zh-CN')}
            </p>
          </div>
          <div className="text-right text-[12px]">
            <p>客户：{order.customer.name}</p>
            <p>联系：{order.customer.phone}</p>
            {order.customer.note && <p>备注：{order.customer.note}</p>}
          </div>
          {qr && (
            <figure className="text-center">
              <img src={qr} alt="扫码报工二维码" className="h-[92px] w-[92px]" />
              <figcaption className="mt-0.5 text-[10px] text-slate-600">扫码报工</figcaption>
            </figure>
          )}
        </div>

        <p className="mt-2 text-[12px] text-slate-700">
          安装空间：{order.room.roomName} · {order.room.sizeW}×{order.room.sizeD}×{order.room.sizeH} m · 地板
          {order.room.floorLabel}
        </p>

        {groups.map((g) => (
          <div key={g.group} className="mt-3">
            <h2 className="bg-slate-100 px-2 py-1 text-[13px] font-semibold">
              {g.group}车间 · {g.pieces} 件 · 工时合计 {laborText(g.laborMinutes)}
            </h2>
            <table className="mt-1 w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="border border-slate-300 px-1.5 py-1">商品 / 型号</th>
                  <th className="border border-slate-300 px-1.5 py-1">数量</th>
                  <th className="border border-slate-300 px-1.5 py-1">实际尺寸(宽×深×高 mm)</th>
                  <th className="border border-slate-300 px-1.5 py-1">材质 / 色号</th>
                  <th className="border border-slate-300 px-1.5 py-1">工艺要求</th>
                  <th className="border border-slate-300 px-1.5 py-1">包装</th>
                  <th className="border border-slate-300 px-1.5 py-1">工时</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it, i) => {
                  const s = it.spec
                  return (
                    <tr key={i}>
                      <td className="border border-slate-300 px-1.5 py-1">
                        <div className="font-medium">
                          {it.name}
                          {isCustomSize(it) ? `（非标 ×${it.scale.toFixed(2)}）` : ''}
                        </div>
                        <div className="text-slate-600">{s?.sku || '未编码'}</div>
                      </td>
                      <td className="border border-slate-300 px-1.5 py-1">{it.qty}</td>
                      <td className="border border-slate-300 px-1.5 py-1">
                        {s ? `${sizeText(it)} mm` : '—'}
                      </td>
                      <td className="border border-slate-300 px-1.5 py-1">
                        {it.materialLabel}
                        {s?.colorCode ? ` / ${s.colorCode}` : ''}
                        {s?.materialSku ? <div className="text-slate-600">{s.materialSku}</div> : null}
                      </td>
                      <td className="border border-slate-300 px-1.5 py-1">{s?.craft || '—'}</td>
                      <td className="border border-slate-300 px-1.5 py-1">{s?.packing || '—'}</td>
                      <td className="border border-slate-300 px-1.5 py-1">
                        {s?.laborMinutes ? `${(s.laborMinutes ?? 0) * it.qty} 分` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* 三视图（带尺寸标注） */}
        {order.items.some((it) => it.spec?.views) && (
          <div className="mt-4">
            <h2 className="bg-slate-100 px-2 py-1 text-[13px] font-semibold">外形三视图（单位 mm）</h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {order.items.map((it, i) =>
                it.spec?.views ? (
                  <figure key={i} className="break-inside-avoid">
                    <img src={it.spec.views} alt={`${it.name} 三视图`} className="w-full border border-slate-300" />
                  </figure>
                ) : null,
              )}
            </div>
          </div>
        )}

        {/* 图纸清单 */}
        {order.items.some((it) => it.spec?.drawings?.length) && (
          <div className="mt-4">
            <h2 className="bg-slate-100 px-2 py-1 text-[13px] font-semibold">随单图纸清单</h2>
            <ul className="mt-1 list-inside list-disc text-[11px]">
              {order.items.flatMap((it, i) =>
                (it.spec?.drawings ?? []).map((d, k) => (
                  <li key={`${i}-${k}`}>
                    {it.name} — {d.name}（{d.url.split('/').pop()}）
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-400 pt-2 text-[12px]">
          <span>
            合计：{totals.lines} 项 · {totals.pieces} 件 · 工时 {laborText(totals.laborMinutes)} · 金额 ¥
            {order.totalAmount.toFixed(2)}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-6 text-[12px]">
          {['排产人 / 日期', '质检 / 日期', '入库 / 日期'].map((t) => (
            <div key={t}>
              <div className="border-b border-slate-500 pb-6" />
              <div className="mt-1 text-slate-600">{t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
