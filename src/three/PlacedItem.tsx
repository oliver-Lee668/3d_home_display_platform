import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { PlacedItem as PlacedItemType, Product } from '../types'
import { ProductModel } from './models/ModelRegistry'
import { useSceneStore } from '../store/useSceneStore'
import { getRoom } from '../data/rooms'
import { getProduct } from '../data/catalog'
import { setTransforming } from '../lib/interaction'
import { clamp, clampToRoom, collides, footprint, isFlat, SCALE_MIN, SCALE_MAX } from '../lib/placement'

const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** 选中态高亮：包围盒线框 + 地面足迹 */
function SelectionBox({ w, h, d }: { w: number; h: number; d: number }) {
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d)
    const e = new THREE.EdgesGeometry(box)
    box.dispose()
    return e
  }, [w, h, d])
  useEffect(() => () => edges.dispose(), [edges])

  return (
    <group>
      <lineSegments geometry={edges} position={[0, h / 2, 0]}>
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.95} />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function PlacedItem({ item, product }: { item: PlacedItemType; product: Product }) {
  const groupRef = useRef<THREE.Group>(null!)
  const lastValid = useRef(new THREE.Vector3(item.position[0], 0, item.position[2]))

  const selected = useSceneStore((s) => s.selectedId === item.instanceId)
  const viewMode = useSceneStore((s) => s.viewMode)
  const transformMode = useSceneStore((s) => s.transformMode)
  const select = useSceneStore((s) => s.select)
  const updateItem = useSceneStore((s) => s.updateItem)

  // 将状态应用到 group（拖拽期间 item 不变，故不会与手柄冲突）
  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.position.set(item.position[0], item.position[1], item.position[2])
    g.rotation.set(0, item.rotationY, 0)
    g.scale.setScalar(item.scale)
    lastValid.current.set(item.position[0], 0, item.position[2])
  }, [item.position, item.rotationY, item.scale])

  const handleDown = () => {
    setTransforming(true)
    const g = groupRef.current
    if (g) lastValid.current.set(g.position.x, 0, g.position.z)
  }

  const handleChange = () => {
    const g = groupRef.current
    if (!g) return
    const state = useSceneStore.getState()
    const room = getRoom(state.roomId)

    if (transformMode === 'rotate') {
      g.rotation.set(0, g.rotation.y, 0)
      return
    }
    if (transformMode === 'scale') {
      const s = clamp(g.scale.x, SCALE_MIN, SCALE_MAX)
      g.scale.setScalar(s)
      g.position.y = 0
      return
    }
    // translate：贴地 + 边界 + 碰撞（地毯等薄片自由摆放，不做碰撞）
    g.position.y = 0
    const f = footprint(product, g.scale.x)
    const c = clampToRoom(g.position.x, g.position.z, f.hw, f.hd, room.size)
    g.position.x = c.x
    g.position.z = c.z
    if (isFlat(product)) {
      lastValid.current.set(g.position.x, 0, g.position.z)
      return
    }
    const hit = collides(item.instanceId, g.position.x, g.position.z, f.hw, f.hd, state.items, getProduct)
    if (hit) {
      g.position.x = lastValid.current.x
      g.position.z = lastValid.current.z
    } else {
      lastValid.current.set(g.position.x, 0, g.position.z)
    }
  }

  const handleUp = () => {
    const g = groupRef.current
    if (g) {
      updateItem(item.instanceId, {
        position: [round2(g.position.x), 0, round2(g.position.z)],
        rotationY: round3(g.rotation.y),
        scale: clamp(g.scale.x, SCALE_MIN, SCALE_MAX),
      })
    }
    // 延迟复位，抑制本次点击触发的"点击空白取消选中"
    setTimeout(() => setTransforming(false), 0)
  }

  const showX = transformMode !== 'rotate'
  const showZ = transformMode !== 'rotate'
  const showY = transformMode === 'rotate' || transformMode === 'scale'

  return (
    <>
      <group
        ref={groupRef}
        onClick={(e) => {
          e.stopPropagation()
          if (viewMode === 'orbit') select(item.instanceId)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (viewMode === 'orbit') document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <ProductModel product={product} materialId={item.materialId} />
        {selected && <SelectionBox w={product.size.w} h={product.size.h} d={product.size.d} />}
      </group>

      {selected && viewMode === 'orbit' && (
        <TransformControls
          object={groupRef as unknown as MutableRefObject<THREE.Object3D>}
          mode={transformMode}
          showX={showX}
          showY={showY}
          showZ={showZ}
          size={0.75}
          translationSnap={0.05}
          rotationSnap={Math.PI / 24}
          onMouseDown={handleDown}
          onObjectChange={handleChange}
          onMouseUp={handleUp}
        />
      )}
    </>
  )
}
