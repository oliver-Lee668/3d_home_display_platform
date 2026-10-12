// 全局类型定义：商品、已放置实例、房间配置、视角模式

/** 商品分类 */
export type Category =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'chair'
  | 'storage'
  | 'fridge'
  | 'tv'
  | 'washer'
  | 'decor'

/** 三维尺寸（单位：米），w=宽(x) h=高(y) d=深(z) */
export interface Size3 {
  w: number
  h: number
  d: number
}

/** 材质/颜色选项 */
export interface MaterialOption {
  id: string
  label: string
  /** CSS 颜色字符串，会被转换为 three 颜色 */
  color: string
  metalness?: number
  roughness?: number
}

/** 模型来源：程序化占位体 或 真实 glTF */
export type ModelSource =
  | { kind: 'procedural'; ref: string } // ref 对应 ModelRegistry 中的程序化模型键
  | { kind: 'gltf'; ref: string } // ref 为 public 下的 glTF/GLB 路径

/** 图纸/工艺附件（销售端上传，生产端下载） */
export interface DrawingRef {
  name: string
  /** 后端相对路径（/uploads/xxx.pdf）或已解析的绝对地址 */
  url: string
}

/**
 * 商品规格主数据（销售端维护）。
 * 下单时会连同尺寸换算结果一起快照到订单，作为生产加工依据。
 */
export interface ProductSpec {
  /** 型号/物料编码 */
  sku?: string
  /** 面料/板材等主材 SKU */
  materialSku?: string
  /** 工艺路线与加工要求 */
  craft?: string
  /** 包装规格 */
  packing?: string
  /** 单件标准工时（分钟） */
  laborMinutes?: number
  /** 定制可行域：最小缩放系数 */
  scaleMin?: number
  /** 定制可行域：最大缩放系数 */
  scaleMax?: number
  /** 图纸附件列表 */
  drawings?: DrawingRef[]
}

/** 商品（目录条目） */
export interface Product {
  id: string
  name: string
  category: Category
  size: Size3
  model: ModelSource
  materials: MaterialOption[]
  /** 默认材质 id */
  defaultMaterialId: string
  price?: number
  description?: string
  /** 生产规格主数据（可选，销售端维护） */
  spec?: ProductSpec
}

/** 场景中已放置的一个商品实例 */
export interface PlacedItem {
  instanceId: string
  productId: string
  position: [number, number, number]
  /** 绕 Y 轴旋转（弧度） */
  rotationY: number
  /** 统一缩放系数 */
  scale: number
  materialId: string
}

/** 房间中的窗/门洞口定义（用于墙面开洞与装饰） */
export interface WallOpening {
  /** 位于哪面墙：north=−z, south=+z, west=−x, east=+x */
  wall: 'north' | 'south' | 'west' | 'east'
  /** 沿该墙方向中心位置（相对墙中点，单位米） */
  offset: number
  width: number
  height: number
  /** 底边离地高度 */
  sill: number
  type: 'window' | 'door'
}

/** 地板种类 */
export type FloorKind = 'wood' | 'marble' | 'tile' | 'concrete' | 'carpet' | 'custom'

/** 地板饰面（程序化贴图或自定义上传图） */
export interface FloorFinish {
  id: string
  label: string
  kind: FloorKind
  /** 程序化贴图底色（custom 忽略） */
  baseColor: string
  /** UI 色板显示色 */
  swatch: string
  /** kind=custom 时的图片 dataURL */
  image?: string
}

/** 房间配置（预设或用户定制） */
export interface RoomConfig {
  id: string
  name: string
  size: { w: number; d: number; height: number }
  floorColor: string
  wallColor: string
  ceilingColor: string
  openings: WallOpening[]
  /** 来源：preset 预设 / user 用户定制 */
  source?: 'preset' | 'user'
  /** 用户上传的参考照片 dataURL */
  photo?: string
}

/** 视角模式：轨道观察 / 第一人称漫游 */
export type ViewMode = 'orbit' | 'roam'

/** 变换工具模式 */
export type TransformMode = 'translate' | 'rotate' | 'scale'

/** 保存到 localStorage 的方案 */
export interface SavedScheme {
  name: string
  roomId: string
  items: PlacedItem[]
  savedAt: number
  /** 保存时的地板饰面 */
  floor?: FloorFinish
}
