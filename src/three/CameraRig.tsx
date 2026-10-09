import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { useSceneStore } from '../store/useSceneStore'
import { getRoom } from '../data/rooms'

const EYE_HEIGHT = 1.6

/** 轨道观察模式 */
function OrbitView() {
  const roomId = useSceneStore((s) => s.roomId)
  const room = getRoom(roomId)
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)

  // 进入轨道模式时把相机复位到一个俯视全景位（组件每次切回 orbit 都会重新挂载）
  useEffect(() => {
    const dist = Math.max(room.size.w, room.size.d)
    camera.position.set(dist * 0.75, room.size.height * 1.35, dist * 0.85)
    camera.lookAt(0, room.size.height * 0.35, 0)
    controlsRef.current?.update?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, room.size.height * 0.35, 0]}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.02}
      minDistance={1.2}
      maxDistance={Math.max(room.size.w, room.size.d) * 2.6}
    />
  )
}

/** 第一人称漫游模式：WASD 行走 + 鼠标视角（PointerLock） */
function RoamView() {
  const { camera } = useThree()
  const roomId = useSceneStore((s) => s.roomId)
  const room = getRoom(roomId)
  const keys = useRef<Record<string, boolean>>({})

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, room.size.d / 2 - 0.9)
    camera.lookAt(0, EYE_HEIGHT, 0)

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useFrame((_, delta) => {
    const speed = (keys.current['ShiftLeft'] || keys.current['ShiftRight'] ? 3.6 : 2.0) * delta
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() > 0) forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
    if (keys.current['KeyW'] || keys.current['ArrowUp']) move.add(forward)
    if (keys.current['KeyS'] || keys.current['ArrowDown']) move.sub(forward)
    if (keys.current['KeyD'] || keys.current['ArrowRight']) move.add(right)
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) move.sub(right)

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed)
      camera.position.add(move)
    }

    const mx = room.size.w / 2 - 0.35
    const mz = room.size.d / 2 - 0.35
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -mx, mx)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -mz, mz)
    camera.position.y = EYE_HEIGHT
  })

  return <PointerLockControls />
}

export function CameraRig() {
  const viewMode = useSceneStore((s) => s.viewMode)
  return viewMode === 'roam' ? <RoamView /> : <OrbitView />
}
