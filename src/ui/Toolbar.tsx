import type { ReactNode } from 'react'
import { ROOMS } from '../data/rooms'
import { useSceneStore } from '../store/useSceneStore'
import { takeScreenshot } from '../lib/screenshot'
import type { IconName } from './icons'
import { Icon } from './icons'
import type { TransformMode } from '../types'

export function Toolbar() {
  const roomId = useSceneStore((s) => s.roomId)
  const viewMode = useSceneStore((s) => s.viewMode)
  const transformMode = useSceneStore((s) => s.transformMode)
  const showGrid = useSceneStore((s) => s.showGrid)
  const hasSelection = useSceneStore((s) => s.selectedId !== null)
  const hasSaved = useSceneStore((s) => s.hasSaved)
  const itemCount = useSceneStore((s) => s.items.length)

  const setRoom = useSceneStore((s) => s.setRoom)
  const setViewMode = useSceneStore((s) => s.setViewMode)
  const setTransformMode = useSceneStore((s) => s.setTransformMode)
  const toggleGrid = useSceneStore((s) => s.toggleGrid)
  const resetScene = useSceneStore((s) => s.resetScene)
  const saveScheme = useSceneStore((s) => s.saveScheme)
  const loadScheme = useSceneStore((s) => s.loadScheme)
  const notify = useSceneStore((s) => s.notify)

  const handleRoom = (id: string) => {
    if (id === roomId) return
    if (itemCount > 0 && !window.confirm('切换房间会清空当前已摆放的物品，确定继续？')) return
    setRoom(id)
  }

  const handleReset = () => {
    if (itemCount === 0) return
    if (window.confirm('确定清空当前场景中的所有物品？')) resetScene()
  }

  const handleScreenshot = () => {
    const ok = takeScreenshot(roomId)
    notify(ok ? '截图已下载' : '截图失败')
  }

  return (
    <header className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center gap-2">
      {/* 品牌 */}
      <div className="panel pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2">
        <Icon name="home" className="text-brand-500" size={18} />
        <span className="text-sm font-semibold tracking-wide text-slate-100">家居 3D 展示台</span>
      </div>

      {/* 房间切换 */}
      <div className="panel pointer-events-auto flex items-center gap-1 rounded-xl p-1">
        {ROOMS.map((r) => (
          <SegBtn key={r.id} active={roomId === r.id} onClick={() => handleRoom(r.id)}>
            {r.name}
          </SegBtn>
        ))}
      </div>

      {/* 视角模式 */}
      <div className="panel pointer-events-auto flex items-center gap-1 rounded-xl p-1">
        <SegBtn active={viewMode === 'orbit'} onClick={() => setViewMode('orbit')} icon="orbit" label="观察" />
        <SegBtn active={viewMode === 'roam'} onClick={() => setViewMode('roam')} icon="roam" label="漫游" />
      </div>

      {/* 变换模式（仅观察模式且选中物品时可用） */}
      <div
        className={`panel pointer-events-auto hidden items-center gap-1 rounded-xl p-1 transition sm:flex ${
          viewMode === 'orbit' && hasSelection ? 'opacity-100' : 'pointer-events-none opacity-40'
        }`}
      >
        <SegBtn active={transformMode === 'translate'} onClick={() => setTransformMode('translate' as TransformMode)} icon="move" label="移动" />
        <SegBtn active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} icon="rotate" label="旋转" />
        <SegBtn active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} icon="scale" label="缩放" />
      </div>

      <div className="flex-1" />

      {/* 右侧操作 */}
      <div className="panel pointer-events-auto flex items-center gap-1 rounded-xl p-1">
        <IconBtn active={showGrid} onClick={toggleGrid} icon="grid" title="地面网格" />
        <IconBtn onClick={handleScreenshot} icon="camera" title="截图保存 (PNG)" />
        <IconBtn onClick={saveScheme} icon="save" title="保存方案到本地" />
        <IconBtn onClick={loadScheme} icon="load" title="加载已保存方案" disabled={!hasSaved} />
        <IconBtn onClick={handleReset} icon="trash" title="清空场景" disabled={itemCount === 0} danger />
      </div>
    </header>
  )
}

function SegBtn({
  active,
  onClick,
  children,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  children?: ReactNode
  icon?: IconName
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition ${
        active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      {icon && <Icon name={icon} size={16} />}
      {label ?? children}
    </button>
  )
}

function IconBtn({
  onClick,
  icon,
  title,
  active = false,
  disabled = false,
  danger = false,
}: {
  onClick: () => void
  icon: IconName
  title: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'bg-brand-600 text-white'
          : danger
            ? 'text-rose-300 hover:bg-rose-500/15'
            : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      <Icon name={icon} size={18} />
    </button>
  )
}
