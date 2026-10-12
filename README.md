# 家居 3D 定制展示与下单平台（Furniture Showroom）

一套**三端分离**的 Web 3D 家具家电定制平台，覆盖完整业务闭环：

> 客户在 3D 样板间里定制布置 → 确认下单 → 销售确认 → 生产确认 · 进入生产 → 完成生产
> （生产端发现规格/工艺不可行时可**退回销售**，销售与客户改妥后重新提交）

- **客户展示端**（静态部署，直接发给用户）：3D 样板间、商品库、拖拽摆放/旋转/缩放、材质换色、房间定制、地板替换、第一人称漫游、截图、保存方案、下单与查单（下单前校验定制尺寸是否在工艺可行域内）。
- **销售端**：订单确认台 + **商品库维护**（上传替换模型、改价、新增商品、下架/还原）+ **规格主数据维护**（型号 SKU、主材、工艺、包装、工时、定制可行域、图纸上传）+ **地板维护**（上传新地板、下架/删除）。
- **生产端**：订单确认台（生产确认·进入生产、完成生产、退回销售）+ **生产工单**（按车间拆单分组、毫米级实际尺寸、三视图、图纸下载、工时合计、CSV/打印导出）。
- **后端**：Go + MySQL，订单状态机、规格快照与可行域校验、目录条目、文件上传与静态服务。

---

## 三端产物与权限边界

前端权限采用**构建期物理隔离**（非运行时判断）：由 `VITE_APP_ROLE` 在编译期注入角色，产出三个互不包含对方代码的独立包。

| 产物 | 构建命令 | 内容 | 隔离保证 |
|---|---|---|---|
| 客户展示端 | `npm run build:user`（默认 `build` 同） | 3D 展示 + 定制 + 下单 + 我的订单 | **无管理台入口**；手动输入 `#/admin` 自动回落展示端并清除 hash |
| 销售端 | `npm run build:sales` | 确认台（销售部）+ 商品库 + 地板 | 角色锁定，无部门切换；**不含任何 3D 展示代码** |
| 生产端 | `npm run build:factory` | 确认台（生产部） | 角色锁定，无商品库/地板页签；**不含任何 3D 展示代码** |

产物体积即为隔离证据：客户包约 **1.3 MB**（含 three.js），销售/生产包约 **200 KB**（3D 代码被完全摇树移除，生产工单的三视图为下单时生成的静态图片，无需在员工端引入 three.js）。

角色定义见 `src/lib/appRole.ts`，环境文件 `.env.user` / `.env.sales` / `.env.factory`。

> **部署建议**：三个 `dist` 分别发布到独立域名/路径（如 `shop.x.com` / `sales.x.com` / `factory.x.com`），客户 URL 公开，销售/生产 URL 走内网或 VPN。
> 当前为**部署级隔离**（URL 即门禁）。若要求"单一部署 + 账号登录"，需再加用户表 + JWT/Session 鉴权（见文末扩展项）。

---

## 技术栈

**前端**：Vite 5 · React 18 · TypeScript 5 · three 0.169 · @react-three/fiber 8 · @react-three/drei 9 · @react-three/postprocessing 2（SSAO 环境光遮蔽）· zustand · Tailwind CSS 3
**后端**：Go 1.24（标准库 `net/http`，方法+路径模式路由）· `go-sql-driver/mysql` · MySQL 8
**运行环境**：Node.js ≥ 18（验证于 v24）· Go ≥ 1.22 · MySQL 8（可选，缺省可用内存模式）

---

## 快速开始

### 1. 启动后端（默认 :8080）

```powershell
cd backend
go mod tidy
go run .
```

环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `STORAGE` | `mysql` | `memory` = 内存演示模式（重启即失，无需数据库） |
| `MYSQL_DSN` | `root:123456@tcp(127.0.0.1:3306)/furniture_showroom?parseTime=true&charset=utf8mb4` | MySQL 连接串 |
| `PORT` | `8080` | 监听端口 |

启动时 `ensureSchema` 会**自动建库建表**（`orders`、`catalog_entries`），无需手工执行 SQL；`backend/schema.sql` 仅供手工建表参考。

### 2. 启动前端

```bash
npm install

npm run dev            # 客户展示端  http://localhost:5173
npm run dev:sales      # 销售端      http://localhost:5184
npm run dev:factory    # 生产端      http://localhost:5175
```

三个 dev 命令的端口已在 `package.json` 中用 `--strictPort` 固定，端口被占用时直接报错而非静默换端口。

后端地址由 `VITE_API_BASE` 配置（默认 `http://localhost:8080`），可在 `.env.*` 中覆盖。

### 3. 生产构建

```bash
npm run build:user       # 客户展示端
npm run build:sales      # 销售端
npm run build:factory    # 生产端
npm run typecheck        # 类型检查
```

---

## 订单闭环与状态机

```
主流程：submitted ─sales_confirm─▶ sales_confirmed ─production_confirm─▶ in_production ─complete─▶ completed
退回：  sales_confirmed | in_production ─reject（必填原因）─▶ rejected ─resubmit─▶ sales_confirmed
```

- 非法流转返回 **409**（例如生产端直接确认未经销售确认的订单）。
- `reject`（生产退回）**必须填写原因**，否则返回 **400**；原因写入流转历史，销售端与客户「我的订单」都能看到。退回后由销售 `resubmit` 重新提交生产。
- 每次流转写入 `history`（状态、操作人、时间、备注），确认台完整展示。
- 订单内容：客户姓名/电话/备注、房间信息（尺寸 + 地板 + **3D 场景截图快照**）、明细（商品/材质/缩放/数量/单价 + **生产规格快照**）、合计金额。
- 客户在展示端点「我的订单」按手机号查询进度；销售/生产确认台每 8 秒轮询刷新。

---

## 生产工单与规格主数据

生产人员拿到的不是「客户买了什么」，而是「要造什么」。为此引入两层数据：

**① 商品规格主数据（销售端维护，存于目录条目）**

| 字段 | 含义 |
|---|---|
| `sku` / `materialSku` | 型号编码 / 主材（面料、板材）编码 |
| `craft` / `packing` | 工艺路线与加工要求 / 包装规格 |
| `laborMinutes` | 单件标准工时（分钟），工单按数量汇总 |
| `scaleMin` / `scaleMax` | **定制可行域**：允许的缩放系数区间（填 `1~1` 即表示不接受尺寸定制，如家电标准品） |
| `drawings[]` | 图纸/工艺附件（PDF/DWG/DXF/STEP/IGES/ZIP），生产端直接下载 |

内置商品在 `src/data/catalog.ts` 中带**规格基线**（13 件商品均已编码），销售端「规格/图纸」按钮可覆盖或补充。

**② 下单时冻结的规格快照（`order.items[].spec`）**

- **为什么要快照**：销售事后仍可替换模型、改规格，但已下单订单的加工依据必须不变——因此下单瞬间把 SKU、材质色号、工艺、包装、工时、图纸清单一并写入订单行。
- **尺寸换算**：标准尺寸（米）× 缩放系数 → **实际毫米尺寸**，由**服务端重算**（`sizeWmm/sizeHmm/sizeDmm`），防止前端篡改；工单与 CSV 一律以毫米呈现。
- **可行域双重校验**：展示端下单弹窗先拦截并提示（禁用提交按钮），后端依据目录条目再校验一次，越界返回 **400** 并给出「允许 ×0.90 ~ ×1.20」这样的可读原因。
- **三视图**：下单时为每个订单行生成一张 `900×400` 的 JPEG（正视/侧视/俯视外形投影 + 红色尺寸标注 + 标题栏：实际尺寸、数量、材质色号、缩放、工艺、包装、工时），随订单存库。它是**读图与打印用的工单示意图**，精确几何由随单 CAD 图纸承担——因此员工端无需引入 three.js。

**生产端工单面板**（订单卡片 →「生产工单」）：

- 按**车间拆单分组**（家具 / 家电 / 软装，取自商品分类），每组显示项数、件数、工时合计；
- 每行显示型号、实际/标准毫米尺寸、材质与色号、主材 SKU、工艺、包装、单件与小计工时，非标定制项打「非标 ×1.20」标记；
- 图纸一键下载、三视图内嵌显示；
- **导出 CSV**（含车间/分类/尺寸/材质/工艺/包装/工时/金额，带 BOM，Excel 直接打开不乱码）与**打印工单**（浅色纸样预览 + `@media print` 只打印工单区域，含排产/质检/入库签字栏）。
- 规格主数据上线前的历史订单没有快照，工单面板会明确提示「缺少型号/尺寸/工艺信息，请联系销售补充后再排产」。

---

## 销售端目录维护（商品库 / 地板上传替换）

内置商品与地板是**代码基线**（`src/data/catalog.ts`、`src/data/floors.ts`），销售端的改动以**目录条目**存入 MySQL `catalog_entries` 表，用户端拉取后与基线合并——因此内置项可被替换/下架，也可新增上传项，且后端不可用时用户端自动回落基线（离线可用）。

| 条目类型 | entryId 约定 | 作用 |
|---|---|---|
| `product_override` | `po_<商品id>` | 覆盖内置商品：替换模型 / 改价 / 改名 / 改尺寸材质 / **改规格主数据**（多次修改自动叠加） |
| `product_custom` | `pc_<商品id>` | 新增商品（上传 glTF/GLB，规格写在商品负载的 `spec` 里） |
| `product_disable` | `pd_<商品id>` | 下架内置商品（可「恢复上架」） |
| `floor_custom` | `fc_<地板id>` | 新增地板（上传贴图，可删除） |
| `floor_disable` | `fd_<地板id>` | 下架内置地板（可恢复） |

**销售端操作路径**：确认台 →「商品库」页签 → 任一商品的「替换模型 / 改价 / 规格图纸 / 还原内置 / 下架」，或「+ 新增商品（上传模型）」；「地板」页签 → 上传新地板 / 下架 / 删除。

**上传文件**：模型 `.glb`/`.gltf`，贴图 `.png`/`.jpg`/`.jpeg`/`.webp`，图纸/工艺文件 `.pdf`/`.dwg`/`.dxf`/`.step`/`.stp`/`.iges`/`.igs`/`.zip`，单文件 ≤ 64 MB；存于 `backend/uploads/`（已 gitignore），通过 `GET /uploads/<file>` 对外提供（已开启跨域）。

**用户端生效时机**：页面加载时拉取一次，窗口重新获得焦点时再拉取（销售改完，用户切回页面即刷新）。

**模型归一化**：上传的 glTF 自动等比缩放到商品 `size` 的最大边、底面对齐地面、水平居中；glTF 保留自带 PBR 材质（不支持换色），程序化模型支持材质切换。

---

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（返回存储模式与 DB 连通性） |
| POST | `/api/orders` | 创建订单（客户下单）；服务端按目录条目校验缩放可行域（越界 **400** 并给出允许区间）并重算毫米尺寸 |
| GET | `/api/orders?status=&phone=` | 订单列表（管理台全量 / 客户按手机号查） |
| GET | `/api/orders/{id}` | 订单详情 |
| PATCH | `/api/orders/{id}/status` | 状态流转 `{action, by, note}`；action 为 `sales_confirm` / `production_confirm` / `complete` / `reject`（需 note）/ `resubmit` |
| GET | `/api/entries` | 读取全部目录条目（用户端合并用） |
| POST | `/api/admin/entries` | 新建/覆盖条目 `{entryId, type, payload}` |
| PUT | `/api/admin/entries/{entryId}` | 新建/覆盖条目 `{type, payload}` |
| DELETE | `/api/admin/entries/{entryId}` | 删除条目（还原内置 / 删除上传项） |
| POST | `/api/admin/upload` | 上传文件（multipart 字段 `file`），返回 `{url, name, size}` |
| GET | `/uploads/{file}` | 上传资产静态服务 |

---

## 数据库

MySQL 库 `furniture_showroom`（`utf8mb4`）：

- **orders**：`order_no` 唯一（`SO+yyyymmdd+序号`）、`customer_json`、`room_json`（LONGTEXT，存 3D 截图快照 dataURL）、`items_json`、`history_json`、`total_amount`、时间戳与索引。手机号查询走 `JSON_EXTRACT(customer_json,'$.phone')`。
- **catalog_entries**：`entry_id` 唯一、`type`、`payload_json`（LONGTEXT）、时间戳。

无 MySQL 时设 `$env:STORAGE='memory'` 即可跑通全流程（重启数据丢失）。

---

## 目录结构

```
furniture-showroom/
├── .env.user / .env.sales / .env.factory / .env.production   # 构建期角色
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.js
├── public/models/                  # 内置 glTF/GLB 模型
├── src/
│   ├── App.tsx                     # 角色分流：员工端→确认台；客户端→展示端（含 #/admin 回落）
│   ├── types.ts                    # Product（含 spec 规格主数据）/ PlacedItem / RoomConfig / FloorFinish / SavedScheme
│   ├── data/
│   │   ├── catalog.ts              # 内置商品基线（13 件均带规格基线）+ 运行时目录注册表
│   │   ├── floors.ts               # 内置地板基线 + 运行时地板注册表
│   │   └── rooms.ts                # 预设房间 + 用户自定义房间注册表
│   ├── store/
│   │   ├── useSceneStore.ts        # 场景状态：房间/物品/选中/视角/地板/方案
│   │   └── useCatalogStore.ts      # 目录同步：拉取条目→合并→写入运行时注册表；条目增删改与上传
│   ├── lib/
│   │   ├── api.ts                  # 后端客户端（订单/目录/上传）+ 资产 URL 解析
│   │   ├── appRole.ts              # 构建期角色（user/sales/production）
│   │   ├── export.ts               # 文本/CSV 下载（自动加 BOM，Excel 打开不乱码）
│   │   ├── order.ts                # 状态标签配色、订单行聚合、规格快照与三视图组装、可行域校验、工单分组与工时汇总、CSV
│   │   ├── placement.ts            # 贴地/边界钳制/碰撞/空位搜索
│   │   ├── textures.ts             # 程序化贴图（墙面/木地板/大理石/瓷砖/水泥/地毯/自定义图）
│   │   ├── views.ts                # 三视图生成器（canvas 2D 外形投影 + 尺寸标注 + 标题栏 → JPEG dataURL）
│   │   ├── screenshot.ts / image.ts / storage.ts / interaction.ts
│   ├── three/
│   │   ├── SceneRoot.tsx           # Canvas、灯光、环境、后处理（SSAO）
│   │   ├── Room.tsx                # 房间生成（门窗洞口墙体 + 地板贴图）
│   │   ├── PlacedItem.tsx          # 选中高亮 + 变换手柄 + 拖拽约束
│   │   ├── CameraRig.tsx           # 轨道观察 ↔ 第一人称漫游
│   │   └── models/                 # ModelRegistry（程序化组件 / glTF 加载归一化）+ primitives
│   └── ui/
│       ├── Toolbar.tsx             # 房间/定制房间/地板/下单/我的订单/视角/变换/截图/方案
│       ├── Sidebar.tsx             # 商品库（运行时目录）
│       ├── Inspector.tsx           # 选中项属性（旋转/缩放/材质/复制/删除）
│       ├── FloorPicker.tsx         # 地板选择（内置 + 销售上传 + 本地自定义）
│       ├── RoomEditor.tsx          # 参数化房间定制（尺寸/门窗/参考照片）
│       ├── CheckoutModal.tsx       # 确认下单（客户信息 + 明细 + 可行域前置校验 + 毫米尺寸 + 3D 快照）
│       ├── MyOrders.tsx            # 我的订单（按手机号查进度，含退回原因）
│       ├── AdminConsole.tsx        # 销售/生产确认台（页签：订单/商品库/地板）+ 工单/打印/退回
│       ├── WorkOrder.tsx           # 生产工单面板 + 打印纸样（车间拆单分组/尺寸/工时/三视图/图纸下载）
│       ├── CatalogManager.tsx      # 商品库维护（上传替换模型/改价/新增/下架/还原 + 规格图纸入口）
│       ├── SpecEditor.tsx          # 规格主数据编辑（型号/主材/工艺/包装/工时/定制可行域/图纸上传）
│       ├── FloorManager.tsx        # 地板维护（上传/下架/删除）
│       ├── useFlash.ts             # 自动消失提示条 hook
│       ├── Overlays.tsx / icons.tsx
└── backend/                        # Go 服务
    ├── main.go                     # 路由 + CORS + 订单/目录/上传处理器
    ├── schema.sql                  # 建表参考（启动时自动执行）
    ├── uploads/                    # 上传资产（gitignore）
    └── internal/
        ├── model/                  # 订单与状态机、目录条目类型
        └── store/                  # Store 接口 + MySQL 实现（自动建库建表）+ 内存实现
```

---

## 交互说明

**观察模式（默认）**
- 左键旋转视角、右键平移、滚轮缩放（娃娃屋式俯视）
- 点击物品选中（包围盒高亮 + 变换手柄）；点击空白取消
- 拖拽自动贴地、房间边界钳制、物品间碰撞阻挡（地毯等薄片不参与碰撞）
- 快捷键：`Q`/`E` 旋转 15°、`Delete` 删除、`Ctrl/Cmd+D` 复制、`G` 网格、`Esc` 取消选中

**漫游模式**
- 点击画面锁定鼠标视角，`WASD`/方向键移动，`Shift` 加速，`Esc` 释放
- 相机固定人眼高度 1.6 m，限制在房间内

**房间定制**
- 「定制房间」可按参数生成新房间（宽/深/层高、门窗洞口位置与尺寸），并可上传一张自家照片作为**摆放参考**（贴于场景旁）。
- 单张照片无法反推真实尺寸，因此空间尺寸由用户输入；照片仅辅助对齐视觉参考。

---

## 排错

| 现象 | 处理 |
|---|---|
| 确认台显示「服务未连接」 | 后端未启动：`cd backend; go run .`；或 `VITE_API_BASE` 指向错误 |
| MySQL `Access denied` | 检查 `MYSQL_DSN`；PowerShell 中环境变量会跨命令残留，重启终端或显式重设 |
| 无 MySQL 环境 | `$env:STORAGE='memory'` 后启动后端（演示用） |
| 端口被占用 | 三个 dev 端口已用 `--strictPort` 固定（5173/5184/5175），占用时**直接报错**而非静默换端口：先关掉占用进程，或改 `package.json` 里的端口；后端 `$env:PORT='8081'` |
| 上传模型不显示 | 确认返回 `/uploads/...` 可访问、文件为 `.glb` 单文件含贴图、后端跨域已放开 |
| 上传图纸报「不支持的文件类型」 | 允许：`.glb/.gltf`、`.png/.jpg/.jpeg/.webp`、`.pdf/.dwg/.dxf/.step/.stp/.iges/.igs/.zip`（单文件 ≤ 64 MB），清单见 `backend/main.go` 的 `allowedUploadExt` |
| 下单提交返回 400「超出工艺上限」 | 定制缩放越界：后端以目录条目的 `scaleMin/scaleMax` 为准（优先于前端），先让销售在「规格/图纸」里放宽可行域，或让客户调回尺寸 |
| 点「退回销售」报 400 | `reject` **必须填写原因**（弹框里取消或留空不会发请求，直接调 API 则被 400 拦下） |
| 工单面板提示「缺少型号/尺寸/工艺信息」 | 该订单在规格快照上线前创建，`items[].spec` 为空；无法回填，只能联系销售确认后线下排产 |
| 工单里三视图不显示 | 快照生成失败（如页面 canvas 受限）时 `spec.views` 为空字符串，不影响下单；以随单 CAD 图纸为准 |
| 商品/地板改动未生效 | 用户端切走再切回页面（focus 触发刷新），或强制刷新 |

---

## 后续可扩展

- 账号体系与鉴权（用户表 + JWT/Session），把部署级隔离升级为账号级权限
- CAD 图纸在线预览（PDF.js / STEP 轻量解析）、按订单生成 BOM 与物料领用单
- 排产与工序流转（工位、条码/二维码扫描报工）、对接 ERP/MES
- 在线支付定金、订单取消/退款流程
- 上传模型 Draco/meshopt 压缩 + CDN 分发、模型预览与校验
- 更多真实 CC0 模型库、风格化 ↔ 照片级渲染切换
- AR（WebXR / model-viewer）实景预览、多方案云端保存与分享
