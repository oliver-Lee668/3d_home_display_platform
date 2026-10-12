import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import {
  buildOrderLines,
  buildOrderPayload,
  linesTotal,
  scaleIssues,
  setLastOrderNo,
  setLastPhone,
  sizeText,
  statusLabel,
} from '../lib/order'
import { useSceneStore } from '../store/useSceneStore'
import { Icon } from './icons'

/** 确认下单模态：客户信息 + 定制清单 + 图形验证码 + 总价，提交后进入销售确认环节 */
export function CheckoutModal({ onClose }: { onClose: () => void }) {
  const notify = useSceneStore((s) => s.notify)
  const lines = useMemo(() => buildOrderLines(), [])
  const total = useMemo(() => linesTotal(lines), [lines])
  // 定制尺寸超出工艺可行域时阻止下单（后端仍会再校验一次）
  const issues = useMemo(() => scaleIssues(lines), [lines])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ orderNo: string; status: string } | null>(null)
  // 下单是公开接口，验证码是一次性的：提交后无论成败都作废，失败必须换一张
  const [cap, setCap] = useState<{ id: string; image: string } | null>(null)
  const [capAnswer, setCapAnswer] = useState('')

  const refreshCaptcha = useCallback(async () => {
    setCapAnswer('')
    try {
      const c = await api.captcha()
      setCap({ id: c.id, image: c.image })
    } catch {
      setCap(null) // 后端不可用时保持空，提交时会报具体错
    }
  }, [])

  useEffect(() => {
    void refreshCaptcha()
  }, [refreshCaptcha])

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('请填写姓名与手机号')
      return
    }
    if (lines.length === 0) {
      setError('场景中没有可下单的商品，请先摆放家具')
      return
    }
    if (issues.length > 0) {
      setError('存在超出工艺可行域的定制尺寸，请先调整')
      return
    }
    if (!cap || !capAnswer.trim()) {
      setError('请填写图形验证码')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = await buildOrderPayload(
        {
          name: name.trim(),
          phone: phone.trim(),
          note: note.trim() || undefined,
        },
        { id: cap.id, answer: capAnswer.trim() },
      )
      const order = await api.createOrder(payload)
      setLastPhone(phone.trim())
      setLastOrderNo(order.orderNo)
      setDone({ orderNo: order.orderNo, status: order.status })
      notify('订单已提交，等待销售确认')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败，请检查后端服务'
      // 429 = 下单太频繁被限流；其余失败也把验证码换一张（旧的一次性凭据已作废）
      setError(e instanceof ApiError && e.status === 429 ? `${msg}，请稍后再试` : msg)
      await refreshCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="panel flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="save" className="text-brand-500" size={18} />
            <span className="text-sm font-semibold text-slate-100">确认下单</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" title="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex-1 overflow-y-auto px-4 py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <Icon name="save" size={26} />
            </div>
            <h3 className="text-base font-semibold text-slate-100">下单成功</h3>
            <p className="mt-1 text-[13px] text-slate-400">
              订单号 <b className="text-brand-400">{done.orderNo}</b>
            </p>
            <p className="mt-1 text-[13px] text-slate-400">
              当前状态：<b style={{ color: '#f59e0b' }}>{statusLabel(done.status)}</b>
            </p>
            <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-slate-500">
              订单已下发至公司：销售确认 → 生产确认 → 进入生产。
              <br />
              请记下订单号，可在「我的订单」里用
              <b className="text-slate-400">订单号 + 手机号</b>查询实时进度。
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-500"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {/* 客户信息 */}
              <section className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] text-slate-400">
                  姓名 *
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500"
                    placeholder="您的姓名"
                  />
                </label>
                <label className="block text-[11px] text-slate-400">
                  手机号 *
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500"
                    placeholder="用于查询订单"
                  />
                </label>
                <label className="col-span-2 block text-[11px] text-slate-400">
                  备注（可选）
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] text-slate-100 outline-none focus:border-brand-500"
                    placeholder="交期 / 定制要求等"
                  />
                </label>
              </section>

              {/* 定制清单 */}
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-400">
                  定制清单（含当前空间快照）
                </h3>
                {lines.length === 0 ? (
                  <p className="text-[12px] text-slate-500">场景为空，请先从商品库摆放家具。</p>
                ) : (
                  <div className="divide-y divide-white/5 rounded-lg border border-white/10">
                    {lines.map((l, i) => (
                      <div key={i} className="px-3 py-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-200">
                            {l.name}
                            <span className="ml-2 text-slate-500">
                              {l.materialLabel}
                              {l.scale !== 1 ? ` · 缩放${l.scale.toFixed(2)}` : ''}
                            </span>
                          </span>
                          <span className="text-slate-300">
                            ×{l.qty}
                            <span className="ml-2 text-amber-300">¥{(l.unitPrice * l.qty).toFixed(0)}</span>
                          </span>
                        </div>
                        {l.spec && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-slate-500">
                            <span>型号 {l.spec.sku || '未编码'}</span>
                            <span>定制后 {sizeText(l)} mm</span>
                            <span>标准 {Math.round(l.spec.baseSizeW * 1000)}×{Math.round(l.spec.baseSizeD * 1000)}×{Math.round(l.spec.baseSizeH * 1000)} mm</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-slate-400">合计</span>
                  <span className="font-semibold text-amber-300">¥{total.toFixed(2)}</span>
                </div>
              </section>

              {/* 图形验证码：下单是免登录的公开接口，靠它挡住脚本刷单 */}
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-400">
                  安全验证
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    value={capAnswer}
                    onChange={(e) => setCapAnswer(e.target.value)}
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="输入图中 4 位数字"
                    className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[13px] tracking-widest text-slate-100 outline-none focus:border-brand-500"
                  />
                  {cap ? (
                    <img
                      src={cap.image}
                      alt="验证码，点击刷新"
                      title="看不清？点击换一张"
                      onClick={() => void refreshCaptcha()}
                      className="h-[38px] w-[114px] shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white object-contain"
                    />
                  ) : (
                    <button
                      onClick={() => void refreshCaptcha()}
                      className="h-[38px] shrink-0 rounded-lg border border-dashed border-white/20 px-3 text-[11px] text-slate-400 hover:bg-white/10"
                    >
                      验证码加载失败，点击重试
                    </button>
                  )}
                </div>
              </section>

              {issues.length > 0 && (
                <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
                  <p className="font-medium">以下定制尺寸超出工艺可行域，请回场景中调整后再下单：</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
                    {issues.map((x, i) => (
                      <li key={i}>
                        {x.name}：当前 ×{x.scale.toFixed(2)}，允许 ×{x.min ?? '不限'} ~ ×{x.max ?? '不限'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-slate-300 hover:bg-white/10">
                取消
              </button>
              <button
                onClick={submit}
                disabled={submitting || issues.length > 0 || !cap}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {submitting ? '提交中…' : '提交订单'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
