import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, type ApiOrder } from '../lib/api'
import { statusColor, statusLabel } from '../lib/order'
import { useCatalogStore } from '../store/useCatalogStore'
import { CatalogManager } from './CatalogManager'
import { FloorManager } from './FloorManager'
import { Icon } from './icons'

type Role = 'sales' | 'production'
const OPERATOR_KEY = 'furniture-showroom:adminOperator'

const ROLE_LABEL: Record<Role, string> = {
  sales: '销售部',
  production: '生产部',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 该角色在当前状态下可执行的动作 */
function actionFor(role: Role, status: string): { action: string; label: string } | null {
  if (role === 'sales' && status === 'submitted') return { action: 'sales_confirm', label: '销售确认' }
  if (role === 'production' && status === 'sales_confirmed')
    return { action: 'production_confirm', label: '生产确认 · 进入生产' }
  if (role === 'production' && status === 'in_production') return { action: 'complete', label: '完成生产' }
  return null
}

/** 生产/销售确认台：角色由构建期 VITE_APP_ROLE 锁定，本端只能看到本部门界面 */
export function AdminConsole({ role }: { role: Role }) {
  const [operator, setOperator] = useState(
    () => localStorage.getItem(OPERATOR_KEY) || (role === 'sales' ? '销售01' : '生产01'),
  )
  const [orders, setOrders] = useState<ApiOrder[]>([])
  const [dbOk, setDbOk] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  // 销售端额外拥有商品库/地板维护页签；生产端仅订单
  const [tab, setTab] = useState<'orders' | 'catalog' | 'floor'>('orders')

  const load = useCallback(async () => {
    try {
      const [h, list] = await Promise.all([api.health(), api.listOrders()])
      setDbOk(h.db)
      setOrders(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接订单服务')
      setDbOk(null)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  // 销售端需要目录数据（商品库/地板维护）
  useEffect(() => {
    if (role === 'sales') void useCatalogStore.getState().refresh()
  }, [role])

  const act = async (o: ApiOrder, action: string, label: string) => {
    if (!operator.trim()) {
      window.alert('请先填写操作人姓名')
      return
    }
    setBusyId(o.id)
    try {
      await api.updateStatus(o.id, action, `${ROLE_LABEL[role]}:${operator.trim()}`, label)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-900 p-4">
      {/* 顶栏 */}
      <header className="panel sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
        <Icon name="cube" className="text-brand-500" size={20} />
        <span className="text-sm font-semibold text-slate-100">确认台 · {ROLE_LABEL[role]}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px]"
          style={{
            color: dbOk === null ? '#f59e0b' : dbOk ? '#10b981' : '#ef4444',
            background: (dbOk === null ? '#f59e0b' : dbOk ? '#10b981' : '#ef4444') + '22',
          }}
        >
          {dbOk === null ? '服务未连接' : dbOk ? 'MySQL 已连接' : 'DB 异常'}
        </span>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-[12px] text-slate-400">
          操作人
          <input
            value={operator}
            onChange={(e) => {
              setOperator(e.target.value)
              localStorage.setItem(OPERATOR_KEY, e.target.value)
            }}
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-brand-500"
          />
        </label>
        <button
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-slate-200 hover:bg-white/10"
        >
          刷新
        </button>
      </header>

      {role === 'sales' && (
        <nav className="mb-3 flex gap-1">
          <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')}>
            订单
          </TabBtn>
          <TabBtn active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            商品库
          </TabBtn>
          <TabBtn active={tab === 'floor'} onClick={() => setTab('floor')}>
            地板
          </TabBtn>
        </nav>
      )}

      {role === 'sales' && tab === 'catalog' && <CatalogManager />}
      {role === 'sales' && tab === 'floor' && <FloorManager />}

      {tab === 'orders' && (
        <>
          {error && (
            <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {error}（请确认后端已启动：backend 目录 go run .，默认 :8080）
            </p>
          )}
          {!error && orders.length === 0 && (
            <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-[12px] text-slate-500">
              暂无订单。用户在展示端「确认下单」后会实时出现在这里。
            </p>
          )}

          {/* 订单卡片 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {orders.map((o) => {
              const actBtn = actionFor(role, o.status)
              return (
                <div key={o.id} className="panel rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-100">{o.orderNo}</div>
                      <div className="mt-0.5 text-[12px] text-slate-400">
                        {o.customer.name} · {o.customer.phone}
                        {o.customer.note ? ` · 备注:${o.customer.note}` : ''}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: statusColor(o.status), background: statusColor(o.status) + '22' }}
                    >
                      {statusLabel(o.status)}
                    </span>
                  </div>

                  <div className="mt-3 flex gap-3">
                    {o.room.snapshot && (
                      <img
                        src={o.room.snapshot}
                        alt="定制快照"
                        className="h-28 w-40 shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-300">
                      <div>
                        空间：{o.room.roomName} · {o.room.sizeW}×{o.room.sizeD}×{o.room.sizeH} m · 地板:{o.room.floorLabel}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between">
                            <span className="truncate">
                              {it.name}（{it.materialLabel}
                              {it.scale !== 1 ? `, 缩放${it.scale.toFixed(2)}` : ''}）
                            </span>
                            <span>
                              ×{it.qty} ¥{(it.unitPrice * it.qty).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between font-medium text-amber-300">
                        <span>合计</span>
                        <span>¥{o.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 流转历史 */}
                  <div className="mt-3 space-y-1 border-t border-white/5 pt-2">
                    {o.history.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(h.status) }} />
                        <span className="text-slate-300">{statusLabel(h.status)}</span>
                        <span>· {h.by}</span>
                        <span>· {fmtTime(h.at)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600">下单于 {fmtTime(o.createdAt)}</span>
                    {actBtn && (
                      <button
                        onClick={() => void act(o, actBtn.action, actBtn.label)}
                        disabled={busyId === o.id}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                      >
                        {busyId === o.id ? '处理中…' : actBtn.label}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[12px] transition ${
        active ? 'bg-brand-600 text-white' : 'bg-white/[0.05] text-slate-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}
