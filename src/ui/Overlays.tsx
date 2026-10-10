import { useEffect, useState } from 'react'
import { useSceneStore } from '../store/useSceneStore'
import { getRoom } from '../data/rooms'
import { Icon } from './icons'

/** 顶部/底部轻提示 */
export function Toast() {
  const message = useSceneStore((s) => s.message)
  return (
    <div
      className={`pointer-events-none absolute bottom-20 left-1/2 z-40 -translate-x-1/2 transition-all duration-200 ${
        message ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      {message && (
        <div className="panel rounded-full px-4 py-2 text-[13px] text-slate-100 shadow-lg">{message}</div>
      )}
    </div>
  )
}

/** 漫游模式操作指引 */
export function RoamHint() {
  const viewMode = useSceneStore((s) => s.viewMode)
  if (viewMode !== 'roam') return null
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="panel rounded-xl px-4 py-2 text-center text-[12px] leading-relaxed text-slate-200 shadow-lg">
        <span className="font-medium text-white">漫游模式</span>
        <span className="mx-2 text-slate-500">|</span>
        点击画面锁定视角 · <b className="text-brand-500">WASD</b>/方向键移动 ·
        <b className="text-brand-500"> Shift</b> 加速 · 鼠标转向 · <b className="text-brand-500">ESC</b> 释放
      </div>
    </div>
  )
}

/** 用户定制房间的参考照片卡片（仅观察模式、有照片时显示） */
export function PhotoRef() {
  const viewMode = useSceneStore((s) => s.viewMode)
  const roomId = useSceneStore((s) => s.roomId)
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [roomId])
  const room = getRoom(roomId)
  if (viewMode !== 'orbit' || !room.photo || hidden) return null
  return (
    <div className="pointer-events-auto absolute left-1/2 top-20 z-20 -translate-x-1/2">
      <div className="panel rounded-xl p-2 shadow-lg">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">参考照片 · {room.name}</span>
          <button
            onClick={() => setHidden(true)}
            className="rounded p-0.5 text-slate-400 hover:bg-white/10"
            title="隐藏"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
        <img src={room.photo} alt="房间参考照片" className="max-h-44 w-auto rounded-lg object-contain" />
      </div>
    </div>
  )
}

/** 观察模式快捷键帮助 */
export function HelpBar() {
  const viewMode = useSceneStore((s) => s.viewMode)
  if (viewMode !== 'orbit') return null
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 hidden -translate-x-1/2 md:block">
      <div className="panel flex items-center gap-3 rounded-full px-4 py-1.5 text-[11px] text-slate-400 shadow">
        <span>鼠标：左键旋转 · 右键平移 · 滚轮缩放</span>
        <span className="text-slate-600">|</span>
        <span>点击物品选中</span>
        <span className="text-slate-600">|</span>
        <span>
          <b className="text-slate-300">Q/E</b> 旋转 · <b className="text-slate-300">Del</b> 删除 ·
          <b className="text-slate-300"> Ctrl+D</b> 复制
        </span>
      </div>
    </div>
  )
}
