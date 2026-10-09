# 家居 3D 展示台（Furniture Showroom · MVP）

一个纯前端、可静态部署的 **Web 3D 家具家电仿真展示平台**。客户可在预设样板间中从商品库挑选家具/家电，**拖拽摆放、旋转、缩放、切换材质颜色**，并以**第一人称漫游**查看效果、**截图保存**布置方案，获得"所见即所得"的购物体验。

## 特性

- **预设样板间**：客厅 / 卧室两套房间，程序化生成地板、墙体（带门窗洞口）、天花、踢脚线、窗框玻璃；采用"内朝向单面墙"实现娃娃屋式透视，可从外部俯视整个房间。
- **商品库**：12 件家具/家电/软装（沙发、扶手椅、床、茶几、餐桌、电视柜、衣柜、冰箱、电视、洗衣机、绿植、落地灯、地毯），分类筛选、一键放入房间。
- **摆放交互**：点击选中（蓝色包围盒高亮 + 变换手柄），拖拽移动自动**贴地**、**房间边界钳制**、**物品间碰撞阻挡**（地毯等地面薄片不参与碰撞）；旋转 / 缩放支持手柄与滑杆两种方式。
- **材质/颜色**：每个商品可配置多套材质（颜色 / 金属度 / 粗糙度），选中后即时切换。
- **视角**：轨道观察（OrbitControls，娃娃屋俯视）↔ 第一人称漫游（PointerLock + WASD/方向键行走、Shift 加速、限房间内、人眼高度）。
- **截图与方案**：一键截图下载 PNG；方案保存到 localStorage，可加载/清空。
- **数据驱动**：商品与房间均为 TS 数据，改数据即可扩展，无需改渲染逻辑。
- **模型可替换**：默认使用程序化占位模型（离线可跑）；把真实 glTF/GLB 放入 `public/models` 并修改目录条目即可替换。

## 技术栈

- Vite 5 + React 18 + TypeScript 5
- three 0.169 + @react-three/fiber 8 + @react-three/drei 9
- zustand（状态管理）
- Tailwind CSS 3（UI 样式）
- 无后端，纯静态，可部署到任意静态托管（Vercel / Netlify / OSS / Nginx）

## 快速开始

```bash
# 安装依赖
npm install

# 开发（默认 http://localhost:5173）
npm run dev

# 类型检查
npm run typecheck

# 生产构建（输出 dist/）
npm run build

# 预览生产构建
npm run preview
```

## 目录结构

```
furniture-showroom/
├── index.html
├── package.json / vite.config.ts / tsconfig.json
├── tailwind.config.js / postcss.config.js
├── public/
│   └── models/                 # 真实 glTF/GLB 放这里
├── src/
│   ├── main.tsx / App.tsx / index.css
│   ├── types.ts                # Product / PlacedItem / RoomConfig / ViewMode
│   ├── data/
│   │   ├── catalog.ts          # 商品目录（尺寸/材质/价格/模型来源）
│   │   └── rooms.ts            # 预设房间（客厅/卧室）
│   ├── store/useSceneStore.ts  # zustand：房间/物品/选中/视角 + actions
│   ├── lib/
│   │   ├── placement.ts        # 贴地/边界/碰撞/空位搜索
│   │   ├── interaction.ts      # 拖拽期瞬时标志
│   │   ├── screenshot.ts       # 截图下载
│   │   └── storage.ts          # 方案 localStorage
│   ├── three/
│   │   ├── SceneRoot.tsx       # Canvas、灯光、环境、网格
│   │   ├── Room.tsx            # 房间生成（带门窗洞口的墙）
│   │   ├── PlacedItem.tsx      # 已放置商品：选中高亮 + 变换手柄 + 约束
│   │   ├── CameraRig.tsx       # orbit ↔ 第一人称漫游
│   │   └── models/
│   │       ├── ModelRegistry.tsx  # 程序化组件 / glTF 加载与归一化
│   │       └── primitives/        # 程序化占位模型 + 公共构件
│   └── ui/
│       ├── Toolbar.tsx         # 房间/视角/变换/网格/截图/保存/加载/清空
│       ├── Sidebar.tsx         # 商品库
│       ├── Inspector.tsx       # 选中项属性（旋转/缩放/材质/复制/删除）
│       ├── Overlays.tsx        # 提示/漫游指引/快捷键帮助
│       └── icons.tsx           # 内联 SVG 图标
```

## 交互说明

**观察模式（默认）**
- 鼠标左键旋转视角、右键平移、滚轮缩放
- 点击物品选中；点击空白取消选中
- 选中后出现变换手柄：移动 / 旋转 / 缩放（顶部工具栏切换模式）
- 快捷键：`Q`/`E` 旋转、`Delete` 删除、`Ctrl+D` 复制、`G` 网格、`Esc` 取消选中

**漫游模式**
- 点击画面锁定鼠标视角，`WASD`/方向键移动，`Shift` 加速，`Esc` 释放鼠标
- 相机固定人眼高度（1.6m），并被限制在房间内

## 替换为真实商品模型

1. 将 GLB/glTF 放入 `public/models/`（建议 Draco/meshopt 压缩）。
2. 打开 `src/data/catalog.ts`，把对应商品的 `model` 改为：
   ```ts
   model: { kind: 'gltf', ref: '/models/sofa.glb' }
   ```
3. 刷新即可。模型会自动等比缩放到商品 `size` 的最大边、底面对齐地面、水平居中。

> 说明：glTF 模型保留其自带材质；颜色/材质变体请提供多个模型文件，或后续接入贴图切换。程序化模型则完全支持材质切换。

## 扩展商品 / 房间

- 商品：在 `src/data/catalog.ts` 的 `CATALOG` 中追加条目（`size` 为米制 w/h/d；`model.kind='procedural'` 时 `ref` 需在 `ModelRegistry` 的程序化表中存在，否则渲染为占位盒）。
- 房间：在 `src/data/rooms.ts` 的 `ROOMS` 中追加（`size` 与 `openings` 门窗洞口）。

## 后续可扩展（非本次范围）

- FastAPI 后端 + 商品/模型管理后台、素材 CDN
- AR（WebXR / model-viewer）实景预览
- 用户自定义户型编辑器
- 多方案云端保存与分享、电商下单集成
