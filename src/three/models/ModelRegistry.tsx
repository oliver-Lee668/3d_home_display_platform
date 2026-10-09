import { Suspense, useMemo } from 'react'
import type { ComponentType } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { Product, Size3 } from '../../types'
import type { ModelProps } from './primitives/parts'
import { BoxMesh } from './primitives/parts'
import { Sofa, Chair, Bed, Table, Cabinet, Wardrobe } from './primitives/Furniture'
import { Fridge, TV, Washer } from './primitives/Appliances'
import { Plant, Lamp, Rug } from './primitives/Decor'

/** 程序化模型注册表：model.ref -> 组件 */
const PROCEDURAL: Record<string, ComponentType<ModelProps>> = {
  sofa: Sofa,
  chair: Chair,
  bed: Bed,
  table: Table,
  cabinet: Cabinet,
  wardrobe: Wardrobe,
  fridge: Fridge,
  tv: TV,
  washer: Washer,
  plant: Plant,
  lamp: Lamp,
  rug: Rug,
}

/** 未知模型 ref 的兜底：按商品尺寸渲染一个占位盒 */
function FallbackBox({ size, color, roughness }: ModelProps) {
  return <BoxMesh size={[size.w, size.h, size.d]} position={[0, size.h / 2, 0]} color={color} roughness={roughness} />
}

/**
 * 真实 glTF/GLB 模型加载：
 * - 等比缩放到商品 size 的最大边（保持原始比例）
 * - 底面对齐 y=0，水平居中
 * - 保留模型自带材质（颜色变体请提供多个模型文件或后续做贴图切换）
 */
function GltfModel({ url, size }: { url: string; size: Size3 }) {
  const { scene } = useGLTF(url)
  const object = useMemo(() => {
    const cloned = scene.clone(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const cur = new THREE.Vector3()
    box.getSize(cur)
    const targetMax = Math.max(size.w, size.h, size.d)
    const curMax = Math.max(cur.x, cur.y, cur.z)
    const scale = curMax > 0 ? targetMax / curMax : 1
    cloned.scale.setScalar(scale)

    const box2 = new THREE.Box3().setFromObject(cloned)
    const center = new THREE.Vector3()
    box2.getCenter(center)
    cloned.position.x -= center.x
    cloned.position.z -= center.z
    cloned.position.y -= box2.min.y

    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return cloned
  }, [scene, size])

  return <primitive object={object} />
}

/**
 * 商品模型渲染入口：根据 product.model.kind 选择程序化组件或 glTF。
 * materialId 决定主材质颜色/金属度/粗糙度（程序化模型生效）。
 */
export function ProductModel({ product, materialId }: { product: Product; materialId: string }) {
  const mat =
    product.materials.find((m) => m.id === materialId) ??
    product.materials.find((m) => m.id === product.defaultMaterialId) ??
    product.materials[0]

  const props: ModelProps = {
    size: product.size,
    color: mat?.color ?? '#9aa0a6',
    metalness: mat?.metalness ?? 0,
    roughness: mat?.roughness ?? 0.8,
  }

  if (product.model.kind === 'gltf') {
    return (
      <Suspense fallback={<FallbackBox {...props} />}>
        <GltfModel url={product.model.ref} size={product.size} />
      </Suspense>
    )
  }

  const Component = PROCEDURAL[product.model.ref] ?? FallbackBox
  return <Component {...props} />
}
