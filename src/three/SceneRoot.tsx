import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, Grid } from '@react-three/drei'
import { EffectComposer, SSAO, Bloom, Vignette } from '@react-three/postprocessing'
import { Room } from './Room'
import { PlacedItem } from './PlacedItem'
import { CameraRig } from './CameraRig'
import { useSceneStore } from '../store/useSceneStore'
import { getRoom } from '../data/rooms'
import { getProduct } from '../data/catalog'
import { isTransforming } from '../lib/interaction'

/** 渲染所有已放置商品 */
function SceneItems() {
  const items = useSceneStore((s) => s.items)
  return (
    <group>
      {items.map((it) => {
        const product = getProduct(it.productId)
        if (!product) return null
        return <PlacedItem key={it.instanceId} item={it} product={product} />
      })}
    </group>
  )
}

/** 场景内容：灯光 + 环境 + 房间 + 物品 + 相机 + 网格 */
function RoomScene() {
  const roomId = useSceneStore((s) => s.roomId)
  const showGrid = useSceneStore((s) => s.showGrid)
  const room = getRoom(roomId)
  const { w, d, height } = room.size
  const lightDist = Math.max(w, d)

  return (
    <>
      {/* 基础照明：半球光 + 环境光 + 主平行光（投射阴影） */}
      <hemisphereLight args={['#fff6e8', '#b9997a', 0.65]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow
        position={[lightDist * 0.7, height * 2.2, lightDist * 0.9]}
        intensity={1.15}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={height * 4 + lightDist * 3}
        shadow-camera-left={-lightDist}
        shadow-camera-right={lightDist}
        shadow-camera-top={lightDist}
        shadow-camera-bottom={-lightDist}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* 暖色补光（不投影）：柔化暗部，避免死黑 */}
      <directionalLight position={[-lightDist * 0.8, height * 1.2, lightDist * 0.5]} intensity={0.35} color="#ffe3c0" />
      {/* 冷色轮廓光：增强体积感与背景分离 */}
      <directionalLight position={[0, height * 1.6, -lightDist * 1.1]} intensity={0.3} color="#cfe0ff" />

      {/* 本地生成的环境反射（不依赖网络），提升金属/家电质感 */}
      <Environment resolution={512} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.0} color="#dfe8ff" position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#fff3e2" position={[5, 2, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 2, -5]} scale={[8, 4, 1]} />
      </Environment>

      <Room room={room} />
      <SceneItems />

      {showGrid && (
        <Grid
          position={[0, 0.004, 0]}
          args={[w, d]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#8a94a6"
          sectionSize={1}
          sectionThickness={1.1}
          sectionColor="#5b6474"
          fadeDistance={lightDist * 3}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />
      )}

      <CameraRig />

      {/* 照片级后处理：SSAO 接触暗角 + 轻微泛光 + 暗角，增强体积与真实感 */}
      <EffectComposer multisampling={4} enableNormalPass>
        <SSAO
          intensity={14}
          radius={0.12}
          luminanceInfluence={0.6}
          worldDistanceThreshold={20}
          worldDistanceFalloff={0}
          worldProximityThreshold={0.5}
          worldProximityFalloff={0}
        />
        <Bloom intensity={0.22} luminanceThreshold={0.92} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette offset={0.22} darkness={0.5} />
      </EffectComposer>
    </>
  )
}

export function SceneRoot() {
  const select = useSceneStore((s) => s.select)
  const roomId = useSceneStore((s) => s.roomId)
  const room = getRoom(roomId)
  const dist = Math.max(room.size.w, room.size.d)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.08
      }}
      camera={{ position: [dist * 0.75, room.size.height * 1.35, dist * 0.85], fov: 50, near: 0.1, far: 200 }}
      onPointerMissed={() => {
        if (!isTransforming()) select(null)
      }}
    >
      <color attach="background" args={['#242932']} />
      <fog attach="fog" args={['#242932', dist * 3.5, dist * 9]} />
      <Suspense fallback={null}>
        <RoomScene />
      </Suspense>
    </Canvas>
  )
}
