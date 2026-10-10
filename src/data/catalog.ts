import type { Category, Product } from '../types'

/** 分类元信息（用于侧边栏 Tab 与图标） */
export const CATEGORY_META: Record<Category, { label: string; group: '家具' | '家电' | '软装' }> = {
  sofa: { label: '沙发', group: '家具' },
  bed: { label: '床', group: '家具' },
  table: { label: '桌几', group: '家具' },
  chair: { label: '椅凳', group: '家具' },
  storage: { label: '柜类', group: '家具' },
  fridge: { label: '冰箱', group: '家电' },
  tv: { label: '电视', group: '家电' },
  washer: { label: '洗衣机', group: '家电' },
  decor: { label: '软装', group: '软装' },
}

/** 分类展示顺序 */
export const CATEGORY_ORDER: Category[] = [
  'sofa',
  'bed',
  'table',
  'chair',
  'storage',
  'fridge',
  'tv',
  'washer',
  'decor',
]

/**
 * 商品目录内置基线。
 * 销售端上传/替换/下架的变更以「目录条目」存在后端，启动时拉取并与本基线合并
 * （见 store/useCatalogStore）。读取商品请统一用 getProduct() / getAllProducts()。
 * MVP 大部分使用程序化占位模型（model.kind='procedural'）或 public/models 下的 glTF。
 */
export const BUILTIN_CATALOG: Product[] = [
  {
    id: 'sofa-3p',
    name: '北欧三人布艺沙发',
    category: 'sofa',
    size: { w: 2.1, h: 0.85, d: 0.92 },
    model: { kind: 'gltf', ref: '/models/GlamVelvetSofa.glb' },
    defaultMaterialId: 'grey',
    materials: [
      { id: 'grey', label: '雾灰', color: '#8a8f98', roughness: 0.9, metalness: 0 },
      { id: 'beige', label: '米白', color: '#d9cbb3', roughness: 0.92, metalness: 0 },
      { id: 'navy', label: '藏蓝', color: '#37456b', roughness: 0.9, metalness: 0 },
      { id: 'brown', label: '棕褐', color: '#8a5a3b', roughness: 0.88, metalness: 0 },
    ],
    price: 3299,
    description: '三人位布艺沙发，实木框架，高密度海绵坐垫。',
  },
  {
    id: 'armchair',
    name: '单人休闲扶手椅',
    category: 'chair',
    size: { w: 0.82, h: 0.9, d: 0.85 },
    model: { kind: 'gltf', ref: '/models/SheenChair.glb' },
    defaultMaterialId: 'olive',
    materials: [
      { id: 'olive', label: '橄榄绿', color: '#6b7247', roughness: 0.9 },
      { id: 'cream', label: '奶油白', color: '#e6ddc9', roughness: 0.9 },
      { id: 'rust', label: '砖红', color: '#a4553d', roughness: 0.9 },
    ],
    price: 899,
  },
  {
    id: 'bed-queen',
    name: '现代双人床 1.8m',
    category: 'bed',
    size: { w: 1.9, h: 0.55, d: 2.1 },
    model: { kind: 'procedural', ref: 'bed' },
    defaultMaterialId: 'wood',
    materials: [
      { id: 'wood', label: '原木色', color: '#b08d5f', roughness: 0.7 },
      { id: 'walnut', label: '胡桃木', color: '#6b4a2f', roughness: 0.65 },
      { id: 'white', label: '象牙白', color: '#e8e4dc', roughness: 0.75 },
    ],
    price: 2599,
    description: '含床垫与床头板，适配 1.8×2.0m 床品。',
  },
  {
    id: 'coffee-table',
    name: '简约茶几',
    category: 'table',
    size: { w: 1.1, h: 0.42, d: 0.6 },
    model: { kind: 'procedural', ref: 'table' },
    defaultMaterialId: 'wood',
    materials: [
      { id: 'wood', label: '原木色', color: '#c09a6b', roughness: 0.6 },
      { id: 'black', label: '哑光黑', color: '#2c2c2c', roughness: 0.5 },
      { id: 'white', label: '纯白', color: '#f0f0ee', roughness: 0.55 },
    ],
    price: 699,
  },
  {
    id: 'dining-table',
    name: '实木餐桌',
    category: 'table',
    size: { w: 1.5, h: 0.75, d: 0.85 },
    model: { kind: 'procedural', ref: 'table' },
    defaultMaterialId: 'walnut',
    materials: [
      { id: 'walnut', label: '胡桃木', color: '#7a5334', roughness: 0.55 },
      { id: 'oak', label: '浅橡木', color: '#c8a878', roughness: 0.6 },
    ],
    price: 1599,
  },
  {
    id: 'tv-stand',
    name: '电视储物柜',
    category: 'storage',
    size: { w: 1.7, h: 0.5, d: 0.42 },
    model: { kind: 'procedural', ref: 'cabinet' },
    defaultMaterialId: 'white-oak',
    materials: [
      { id: 'white-oak', label: '白橡', color: '#d6c3a5', roughness: 0.6 },
      { id: 'graphite', label: '石墨灰', color: '#4a4d52', roughness: 0.5 },
    ],
    price: 1099,
  },
  {
    id: 'wardrobe',
    name: '双门衣柜',
    category: 'storage',
    size: { w: 1.2, h: 2.05, d: 0.6 },
    model: { kind: 'procedural', ref: 'wardrobe' },
    defaultMaterialId: 'white',
    materials: [
      { id: 'white', label: '暖白', color: '#eae6df', roughness: 0.6 },
      { id: 'wood', label: '原木', color: '#c19a6b', roughness: 0.6 },
    ],
    price: 1899,
  },
  {
    id: 'fridge',
    name: '对开门冰箱',
    category: 'fridge',
    size: { w: 0.83, h: 1.78, d: 0.68 },
    model: { kind: 'gltf', ref: '/models/CommercialRefrigerator.glb' },
    defaultMaterialId: 'steel',
    materials: [
      { id: 'steel', label: '拉丝银', color: '#c3c8cc', roughness: 0.35, metalness: 0.85 },
      { id: 'black', label: '星空黑', color: '#2b2e33', roughness: 0.4, metalness: 0.7 },
      { id: 'white', label: '珍珠白', color: '#eef0f1', roughness: 0.35, metalness: 0.3 },
    ],
    price: 4299,
    description: '风冷无霜，一级能效，520L 大容量。',
  },
  {
    id: 'tv-55',
    name: '55 英寸平板电视',
    category: 'tv',
    size: { w: 1.24, h: 0.72, d: 0.07 },
    model: { kind: 'procedural', ref: 'tv' },
    defaultMaterialId: 'black',
    materials: [
      { id: 'black', label: '曜石黑', color: '#141518', roughness: 0.3, metalness: 0.6 },
    ],
    price: 2799,
  },
  {
    id: 'washer',
    name: '滚筒洗衣机',
    category: 'washer',
    size: { w: 0.6, h: 0.85, d: 0.62 },
    model: { kind: 'procedural', ref: 'washer' },
    defaultMaterialId: 'white',
    materials: [
      { id: 'white', label: '陶瓷白', color: '#f2f3f4', roughness: 0.35, metalness: 0.2 },
      { id: 'silver', label: '钛金银', color: '#c9ced2', roughness: 0.3, metalness: 0.8 },
    ],
    price: 2199,
  },
  {
    id: 'plant',
    name: '绿植盆栽',
    category: 'decor',
    size: { w: 0.5, h: 1.3, d: 0.5 },
    model: { kind: 'gltf', ref: '/models/DiffuseTransmissionPlant.glb' },
    defaultMaterialId: 'green',
    materials: [
      { id: 'green', label: '翠绿', color: '#3f7d3a', roughness: 0.85 },
    ],
    price: 129,
  },
  {
    id: 'floor-lamp',
    name: '落地灯',
    category: 'decor',
    size: { w: 0.4, h: 1.55, d: 0.4 },
    model: { kind: 'procedural', ref: 'lamp' },
    defaultMaterialId: 'warm',
    materials: [
      { id: 'warm', label: '暖光', color: '#f3e2c0', roughness: 0.6 },
      { id: 'cool', label: '冷光', color: '#e6f0f5', roughness: 0.6 },
    ],
    price: 359,
  },
  {
    id: 'rug',
    name: '几何地毯',
    category: 'decor',
    size: { w: 2.0, h: 0.02, d: 1.4 },
    model: { kind: 'procedural', ref: 'rug' },
    defaultMaterialId: 'grey',
    materials: [
      { id: 'grey', label: '浅灰', color: '#b9bcc0', roughness: 0.95 },
      { id: 'blue', label: '雾霾蓝', color: '#7d94a8', roughness: 0.95 },
      { id: 'terracotta', label: '陶土', color: '#b5715a', roughness: 0.95 },
    ],
    price: 459,
  },
]

// ------- 运行时目录（内置基线 + 销售端上传的条目合并结果）-------
let RUNTIME: Product[] = BUILTIN_CATALOG
let RUNTIME_MAP: Record<string, Product> = buildMap(RUNTIME)

function buildMap(list: Product[]): Record<string, Product> {
  return Object.fromEntries(list.map((p) => [p.id, p]))
}

/** 当前生效的完整商品列表（UI 订阅请改用 useCatalogStore） */
export function getAllProducts(): Product[] {
  return RUNTIME
}

/** 由目录同步逻辑调用，写入合并后的运行时目录 */
export function setRuntimeProducts(list: Product[]): void {
  RUNTIME = list
  RUNTIME_MAP = buildMap(list)
}

/** 按 id 快速查找商品（含销售端新增的商品） */
export function getProduct(id: string): Product | undefined {
  return RUNTIME_MAP[id]
}
