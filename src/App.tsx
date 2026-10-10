import { useEffect } from 'react'
import { SceneRoot } from './three/SceneRoot'
import { Toolbar } from './ui/Toolbar'
import { Sidebar } from './ui/Sidebar'
import { Inspector } from './ui/Inspector'
import { Toast, RoamHint, HelpBar, PhotoRef } from './ui/Overlays'
import { useSceneStore } from './store/useSceneStore'

const ROT_STEP = Math.PI / 12 // 15°

export default function App() {
  // 首次进入：有已保存方案则加载，否则载入示例客厅布局
  useEffect(() => {
    const s = useSceneStore.getState()
    if (s.items.length === 0) {
      if (s.hasSaved) s.loadScheme()
      else s.loadStarter()
    }
  }, [])

  // 全局快捷键（仅观察模式生效，避免与漫游 WASD 冲突）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useSceneStore.getState()
      if (s.viewMode !== 'orbit') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Ctrl/Cmd + D 复制
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        if (s.selectedId) {
          e.preventDefault()
          s.duplicateItem(s.selectedId)
        }
        return
      }

      if (e.code === 'Escape') {
        s.select(null)
        return
      }
      if (e.code === 'KeyG') {
        s.toggleGrid()
        return
      }

      const id = s.selectedId
      if (!id) return
      const item = s.items.find((i) => i.instanceId === id)
      if (!item) return

      if (e.code === 'KeyQ') {
        s.updateItem(id, { rotationY: item.rotationY - ROT_STEP })
      } else if (e.code === 'KeyE') {
        s.updateItem(id, { rotationY: item.rotationY + ROT_STEP })
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault()
        s.removeItem(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900">
      {/* 3D 场景铺满整个视口 */}
      <div className="absolute inset-0">
        <SceneRoot />
      </div>

      {/* UI 覆盖层 */}
      <Toolbar />
      <Sidebar />
      <Inspector />
      <PhotoRef />
      <HelpBar />
      <RoamHint />
      <Toast />
    </div>
  )
}
