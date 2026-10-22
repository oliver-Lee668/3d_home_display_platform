# 定制家具 C2M 数字工厂最小闭环（Furniture Showroom）

一套面向定制家具/家居企业的**数字化工厂演示系统**：从客户 3D 定制下单，到销售审单、生产排产、车间扫码报工、看板读数的 **order-to-manufacture 全链路线上化**。

```
客户 3D 定制下单 ─▶ 销售审单 ─▶ 生产确认排产 ─▶ 工单(含二维码) ─▶ 车间 H5 扫码报工 ─▶ 车间看板读数
   C2M 入口          订单流              工单流               执行流(报工)          管理层(聚合)
```

- 📘 **[数字工厂蓝图（As-Is / To-Be）](docs/blueprint.md)**：当前一期闭环的业务泳道、系统组成、管理规则与二期（BOM/工序级报工/APS/ERP·BI）路线图。
- 📗 **[数据字典](docs/data-dictionary.md)**：主数据/交易数据分层、四张表的字段级定义、状态机、报工校验链与看板聚合口径。

四个业务角色、三套前端产物 + 一个 Go 后端：

- **客户展示端**（静态部署，免登录）——**C2M 配置入口**：3D 样板间、拖拽摆放/旋转/缩放、材质换色、房间定制、地板替换、第一人称漫游、截图、保存方案；下单带图形验证码与工艺可行域校验，查单靠**订单号 + 手机号**双因子。
- **销售端**（需登录）：订单确认台 + **商品库维护**（上传替换模型、改价、新增、下架）+ **规格主数据维护**（SKU、主材、工艺、包装、工时、定制可行域、图纸）+ 地板维护。
- **生产端**（需登录）：订单确认台（接单排产/退回）+ **生产工单**（车间拆单、毫米尺寸、三视图、图纸、CSV/打印）+ **工单二维码** + **H5 扫码报工**（开工领活/完工报数）+ **车间看板**（大屏读数）。
- **后端**：Go + MySQL：账号鉴权与角色/动作级权限、订单状态机、规格快照服务端组装、**报工流水与看板聚合**、目录脱敏视图、文件按扩展名鉴权、下单限流与零依赖验证码。

---

## 车间执行层：扫码报工与看板（本期新增）

工单打印出去只是「纸」，报工把执行读数闭环回系统：

1. **工单带码**：生产确认台的工单面板与打印纸样自动生成二维码，内容为 `{生产端地址}#/report?order={单号}`。
2. **H5 报工**（生产端 `#/report`，手机可用）：工人登录后扫码/输单号调出工单 → 逐行「开工领活」或「完工报数（合格/废品）」。扫码用浏览器原生 `BarcodeDetector`（需 HTTPS 或 localhost + Chrome/Edge），不支持时回落手动输入。
3. **业务规则（后端强制）**：仅「生产中」订单可报工（409）；仅生产/管理员角色可报工（403）；完工至少报 1 件（400）；**超报防护**——工单行合格累计不得超过计划件数（400，废品不占额度）；报工人取自登录 token（`角色:显示名`），前端无操作人输入框。
4. **进度回流**：工单面板每行实时显示「报工 合格 x/y」；报工流水只插不改，是看板与进度的唯一事实来源。
5. **车间看板**（生产端 `#/board`，适合挂大屏）：8 秒轮询服务端聚合——在制订单/件数、今日合格/废品/折算工时（合格件×行标准工时）、车间分组进度表、最近 12 条报工流水；「今日」按本地时区零点切日。

详细字段与聚合口径见[数据字典 §4](docs/data-dictionary.md)。

---

## 三端产物与权限边界

权限是**两层**的，缺一不可：

1. **构建期物理隔离（前端）**：由 `VITE_APP_ROLE` 在编译期注入角色，产出三个互不包含对方代码的独立包。它决定“**渲染哪套界面**”。
2. **请求级身份鉴权（后端）**：员工端必须登录，后端逐请求校验 token 里的角色，并按动作再校一次。它决定“**能不能做这件事**”。

> 只有第 1 层是不够的——构建期隔离拦不住直接 `curl` 后端的人。真正的门禁在第 2 层，两者是互补的双保险。

| 产物 | 构建命令 | 内容 | 隔离保证 |
|---|---|---|---|
| 客户展示端 | `npm run build:user`（默认 `build` 同） | 3D 展示 + 定制 + 下单 + 我的订单 | **无管理台入口、无登录入口**；手动输入 `#/admin` 自动回落展示端并清除 hash |
| 销售端 | `npm run build:sales` | 登录页 + 确认台（销售部）+ 商品库 + 地板 | 未登录只能看到登录页；角色锁定，无部门切换；**不含任何 3D 展示代码** |
| 生产端 | `npm run build:factory` | 登录页 + 确认台（生产部）+ **H5 扫码报工（`#/report`）+ 车间看板（`#/board`）** | 未登录只能看到登录页；角色锁定，无商品库/地板页签；**不含任何 3D 展示代码** |

产物体积即为隔离证据：客户包约 **1.3 MB**（含 three.js），销售/生产包约 **210 KB**（3D 代码被完全摇树移除，生产工单的三视图为下单时生成的静态图片，无需在员工端引入 three.js）。

角色定义见 `src/lib/appRole.ts`，环境文件 `.env.user` / `.env.sales` / `.env.factory`。

> **部署建议**：三个 `dist` 分别发布到独立域名/路径（如 `shop.x.com` / `sales.x.com` / `factory.x.com`），客户 URL 公开，销售/生产 URL 走内网或 VPN。上线前**务必**设置 `AUTH_SECRET` 与 `ALLOWED_ORIGINS`，并立即改掉播种账号的初始密码。

---

## 账号与安全边界

### 谁需要登录

| 端 | 登录 | 理由 |
|---|---|---|
| 客户展示端 | ❌ 免登录、不注册 | 匿名浏览 + 下单是产品形态的一部分，加注册会把转化率打死。查单改用**订单号 + 手机号**双因子 |
| 销售端 | ✅ 必须 | 能看全量订单（含客户姓名/手机/备注）、能改价、能上传替换商品库与图纸 |
| 生产端 | ✅ 必须 | 能看工艺、工时、主材 SKU、下载图纸 |

### 默认账号

首次启动且 `users` 表为空时自动播种三个账号，**初始密码统一为 `Showroom@2026`**（可用 `SEED_PASSWORD` 覆盖），启动日志会打印警告：

| 用户名 | 角色 | 显示名 |
|---|---|---|
| `sales01` | 销售 | 销售01 |
| `prod01` | 生产 | 生产01 |
| `admin` | 管理员 | 系统管理员 |

播种账号与管理员代开的账号都带 `must_change=1`：**首次登录后必须改密才能进确认台**。改密前后端只放行 `/api/me` 与 `/api/change-password`，其余员工接口一律 **403**。密码策略：≥ 8 位且同时包含字母与数字，且不得与旧密码相同。

### 角色与动作级权限

只校状态机是不够的——`PATCH /api/orders/{id}/status` 的 `action` 由前端传，若只按角色放行接口，生产账号就能替销售确认。因此每个动作再单独校一次（见 `backend/internal/model/user.go` 的 `actionRoles`）：

| 动作 / 资源 | 销售 | 生产 | 管理员 |
|---|:--:|:--:|:--:|
| `sales_confirm` 销售确认 | ✅ | ❌ | ✅ |
| `resubmit` 重新提交生产 | ✅ | ❌ | ✅ |
| `production_confirm` 生产确认 | ❌ | ✅ | ✅ |
| `complete` 完成生产 | ❌ | ✅ | ✅ |
| `reject` 退回销售（必填原因） | ❌ | ✅ | ✅ |
| **报工 `POST /api/reports`** | ❌ | ✅ | ✅ |
| **看板 / 报工流水（只读）** | ✅ | ✅ | ✅ |
| 商品库 / 地板 / 上传 | ✅ | ❌ | ✅ |
| 新建账号 `POST /api/users` | ❌ | ❌ | ✅ |
| 查看全量订单 / 工单 / 图纸 | ✅ | ✅ | ✅ |

越权返回 **403** 并带上文案（如「生产部无权执行「销售确认」」）；未知动作返回 **400**。

### 会话机制

- **密码存储**：PBKDF2-HMAC-SHA256、**210,000 次迭代**、32 字节密钥、16 字节随机盐，存为 `pbkdf2$<迭代>$<盐>$<散列>`，恒定时间比较。用户不存在时也走一次假散列，抹平响应时间差以防**用户名枚举**。
- **Token**：`<base64url 载荷>.<base64url HMAC-SHA256 签名>`，结构等同 JWT HS256 但**零第三方依赖**（`crypto/hmac` 自实现）。默认有效期 8 小时（`TOKEN_TTL_HOURS`）。
- **角色以库为准**：每次请求都回查数据库复核账号是否仍启用，并用库里的角色/显示名覆盖 token 里的值——调权或停用**即时生效**，不必等旧 token 过期。
- **前端存放**：勾选「记住我」→ `localStorage`；否则 → `sessionStorage`（关标签页即需重登）。收到 401 自动清会话回落登录页。
- **留痕不可伪造**：流转历史的 `history.by` 一律取自 token（格式 `部门:显示名`），前端传什么都被忽略；确认台也不再提供「操作人」手填文本框。

> **已知局限**：token 无状态，服务端没有会话表，因此「退出登录」只是前端清存储——已被拷走的 token 在过期前仍然有效。要支持即时吊销需加黑名单/版本号，见文末扩展项。

### 数据分级

| 数据 | 客户（未登录） | 员工 |
|---|---|---|
| 商品名/价格/材质/3D 模型/地板贴图 | ✅ | ✅ |
| 规格：型号 SKU、定制可行域 `scaleMin`/`scaleMax` | ✅ | ✅ |
| 规格：**工艺、包装、工时、主材 SKU、图纸清单** | ❌ 剔除 | ✅ |
| 订单（客户姓名/手机/备注/明细/快照） | 仅自己那一单 | ✅ 全量 |
| 图纸文件本体（PDF/DWG/STEP…） | ❌ 401 | ✅ |

- `GET /api/entries` 未登录时走**公开视图脱敏**：`spec` 只保留白名单 `{sku, scaleMin, scaleMax}`（可行域必须公开，否则客户端缩放滑杆无法限位）。
- 下单时的生产规格快照由**服务端组装**（`composeSpec`）：机密字段只从服务端基线取，客户端传的一律丢弃；毫米尺寸一律服务端按 `标准尺寸 × 缩放` 重算。因此客户无法给自己订单塞假工艺/假工时/假图纸链接。
- `GET /uploads/{file}` **按扩展名鉴权**：`.pdf/.dwg/.dxf/.step/.stp/.iges/.igs/.zip` 需员工 token 且强制 `Content-Disposition: attachment`；`.glb/.gltf/.png/.jpg/.jpeg/.webp` 仍公开（未登录时 3D 场景就得能加载）。路径做 `filepath.Base` 校验防目录穿越，统一加 `X-Content-Type-Options: nosniff`。
- 因为 `<a download>` 带不上 `Authorization` 头，前端图纸下载一律走 `api.downloadDrawing`（fetch 拿 blob 再触发下载）。

> **规格基线落库**：内置 13 件商品的规格原本只在前端 bundle 里，服务端组不出完整快照。销售端登录后会自动把缺失的基线写入 `catalog_entries`（`ensureSpecBaselines`，**只补缺、不覆盖**销售的手工维护），之后规格数据统一到库里，销售也能在「商品库 → 规格/图纸」里直接维护。基线**含标准尺寸**（取自商品 `size`）：毫米换算因此完全由服务端基线决定，客户端即便伪造 `baseSize*` 也会被丢弃；老基线缺标准尺寸时销售端下次登录会自动补写。

### 下单防刷与客户查单

- **图形验证码**：下单是免登录的公开接口，靠**零依赖自绘**的点阵数字验证码（5×7 点阵 + 正弦错切 + 干扰折线 + 噪点，190×64 PNG）挡住脚本刷单。**一次性消费**、3 分钟过期、提交失败也必须换一张。
  > 已知局限：它只挡普通脚本；带视觉识别能力的自动化仍能读图绕过，真要抗 bot 需换行为验证/第三方验证码。
- **限流**：下单按 IP 与手机号双维度、登录按 IP 与用户名双维度（超限临时锁定）、查单与验证码按 IP；命中返回 **429** 并带 `Retry-After`。默认**不信任 `X-Forwarded-For`**（可伪造），仅在 `TRUST_PROXY=1` 时读取。
- **双因子查单**：`GET /api/orders/lookup?orderNo=&phone=` 两者必须同时命中。「订单不存在」与「手机号不匹配」返回**同一文案同一状态码**（404），无法拿订单号探测某人是否下过单。
- **CORS 白名单**：从 `*` 收紧为精确回显 `ALLOWED_ORIGINS`（缺省只放开本机 5173/5184/5175），并加 `Vary: Origin`。

### 明确不做的事

- 客户端**不做注册/登录**，也不存客户账号。
- 没有短信/邮箱验证码、没有 OAuth、没有自助找回密码——忘记密码由管理员重置（`DELETE FROM users` 后重启后端会重新播种，或由管理员开新账号）。
- 没有独立的操作审计日志表：留痕目前只落在订单的 `history` 里。
- 没有 RBAC 配置界面：角色与动作映射写在代码里（业务上只有三个固定部门，不需要动态配权）。

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
| `AUTH_SECRET` | 随机生成 | **token 签名密钥**。不设置则每次重启用随机密钥，所有已登录会话失效；正式部署必须固定为一段随机长字符串 |
| `TOKEN_TTL_HOURS` | `8` | 登录有效期（小时） |
| `SEED_PASSWORD` | `Showroom@2026` | 首次播种账号的初始密码（带 `must_change`，登录后强制改） |
| `ALLOWED_ORIGINS` | 本机 `5173/5184/5175` | CORS 白名单，逗号分隔的精确 Origin；正式部署改成自己的域名 |
| `TRUST_PROXY` | 未设 | 置 `1` 才读 `X-Forwarded-For` 做限流取 IP；直接暴露到公网时**不要开**（该头可伪造），只在可信反向代理后面开 |

启动时 `ensureSchema` 会**自动建库建表**（`orders`、`catalog_entries`、`users`、`work_reports`），无需手工执行 SQL；`backend/schema.sql` 仅供手工建表参考。首次启动还会自动播种三个部门账号（见「账号与安全边界」）。

```powershell
# 正式部署示例
$env:AUTH_SECRET   = '<一段随机长字符串>'
$env:ALLOWED_ORIGINS = 'https://shop.x.com,https://sales.x.com,https://factory.x.com'
$env:SEED_PASSWORD = '<强初始密码>'
cd backend; go run .
```

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

后端校验（`cd backend`）：

```powershell
gofmt -l .               # 应无输出
go vet ./...
go test ./...            # 规格快照组装/公开视图脱敏 + 报工门禁/超报防护/看板聚合的单元测试
go build -o server.exe . # 构建前先停掉正在运行的 server.exe，否则文件被占用会失败
```

---

## 订单闭环与状态机

```
主流程：submitted ─sales_confirm─▶ sales_confirmed ─production_confirm─▶ in_production ─complete─▶ completed
退回：  sales_confirmed | in_production ─reject（必填原因）─▶ rejected ─resubmit─▶ sales_confirmed
```

- 非法流转返回 **409**（例如生产端直接确认未经销售确认的订单）；**角色无权执行该动作**返回 **403**（例如生产账号调 `sales_confirm`）。
- `reject`（生产退回）**必须填写原因**，否则返回 **400**；原因写入流转历史，销售端与客户「我的订单」都能看到。退回后由销售 `resubmit` 重新提交生产。
- 每次流转写入 `history`（状态、操作人、时间、备注），确认台完整展示。**操作人取自登录 token**（`部门:显示名`），不可手填也不可伪造。
- 订单内容：客户姓名/电话/备注、房间信息（尺寸 + 地板 + **3D 场景截图快照**）、明细（商品/材质/缩放/数量/单价 + **生产规格快照**）、合计金额。
- 客户在展示端点「我的订单」用**订单号 + 手机号**双因子查进度；销售/生产确认台登录后每 8 秒轮询刷新。

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
- 图纸一键下载、三视图内嵌显示；面板头部自动生成**报工二维码**（内容为生产端 H5 报工页地址 + 单号，打印纸样同步带码）；
- 每行实时显示**报工进度**（合格 x/y · 废品，来自报工流水聚合）；
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

**上传文件**：模型 `.glb`/`.gltf`，贴图 `.png`/`.jpg`/`.jpeg`/`.webp`，图纸/工艺文件 `.pdf`/`.dwg`/`.dxf`/`.step`/`.stp`/`.iges`/`.igs`/`.zip`，单文件 ≤ 64 MB；存于 `backend/uploads/`（已 gitignore），通过 `GET /uploads/<file>` 对外提供。其中**图纸类扩展名需员工登录**才能下载，模型与贴图仍公开（详见「数据分级」）。

**用户端生效时机**：页面加载时拉取一次，窗口重新获得焦点时再拉取（销售改完，用户切回页面即刷新）。

**模型归一化**：上传的 glTF 自动等比缩放到商品 `size` 的最大边、底面对齐地面、水平居中；glTF 保留自带 PBR 材质（不支持换色），程序化模型支持材质切换。

---

## REST API

鉴权方式：`Authorization: Bearer <token>`（静态资源也兼容 `?token=` 查询参数，供 `<img>`/`<a>` 使用）。

### 公开接口（客户免登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（返回存储模式与 DB 连通性） |
| POST | `/api/login` | 员工登录 `{username, password}` → `{token, expiresAt, user}`；失败统一 **401**（不区分用户名不存在），超限 **429** 临时锁定 |
| GET | `/api/captcha` | 签发图形验证码 → `{id, image(data URL), expiresIn}`；限流 60 次/10 分钟 |
| POST | `/api/orders` | 创建订单（客户下单）；**必带 `captchaId` + `captchaAnswer`**（一次性，验证码错/过期 **400**）。服务端按目录条目校验缩放可行域（越界 **400** 并给出允许区间）、重算毫米尺寸、**组装完整规格快照**；IP/手机号限流 **429** |
| GET | `/api/orders/lookup?orderNo=&phone=` | 客户自助查单，**两个因子必须同时命中**；缺参数 **400**，未命中 **404**（不泄露是订单不存在还是手机号不对） |
| GET | `/api/entries` | 读取全部目录条目（用户端合并用）。**未登录时自动脱敏**：`spec` 只留 `{sku, scaleMin, scaleMax}` |
| GET | `/uploads/{file}` | 上传资产静态服务；图纸类扩展名需 token（否则 **401**）并强制 `attachment` |

### 员工接口（需登录）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/me` | 任意员工 | 当前登录人（改密前也可访问） |
| POST | `/api/change-password` | 任意员工 | `{oldPassword, newPassword}`；弱密码/新旧相同 **400** |
| GET | `/api/orders?status=&phone=` | 任意员工 | 订单列表（**无 token 一律 401**，不再存在匿名拖全量客户资料的口子） |
| GET | `/api/orders/{id}` | 任意员工 | 订单详情 |
| PATCH | `/api/orders/{id}/status` | **按动作分角色** | `{action, note}`；操作人由后端从 token 取，**请求体里的 `by` 已废弃并被忽略**。越权 **403**、未知动作 **400**、非法流转 **409** |
| POST | `/api/reports` | **生产 / 管理员** | 报工 `{orderId, itemIndex, action: start\|complete, qtyGood?, qtyScrap?, note?}` → **201** `{report, progress}`；非生产中 **409**、超报/数量非法 **400**；worker/workshop/itemName 由服务端写入 |
| GET | `/api/reports?orderId=` | 任意员工 | 本单报工流水（工单行进度由此汇总） |
| GET | `/api/dashboard` | 任意员工 | 车间看板聚合读数：在制/今日合格·废品·折算工时/车间分组/最近 12 条流水 |
| POST/PUT | `/api/admin/entries[/{entryId}]` | 销售 / 管理员 | 新建覆盖条目 `{type, payload}` |
| DELETE | `/api/admin/entries/{entryId}` | 销售 / 管理员 | 删除条目（还原内置 / 删除上传项） |
| POST | `/api/admin/upload` | 销售 / 管理员 | 上传文件（multipart 字段 `file`），返回 `{url, name, size}` |
| POST | `/api/users` | **仅管理员** | 新建账号 `{username, password, role, displayName}` → **201**；重名 **409**、非法角色/弱密码 **400**；新账号带 `must_change` |

错误响应统一为 `{"error": "中文文案"}`；限流额外带 `Retry-After` 头。

---

## 数据库

MySQL 库 `furniture_showroom`（`utf8mb4`），字段级定义见[数据字典](docs/data-dictionary.md)：

- **orders**：`order_no` 唯一（`SO+yyyymmdd+序号`）、`customer_json`、`room_json`（LONGTEXT，存 3D 截图快照 dataURL）、`items_json`、`history_json`、`total_amount`、时间戳与索引。客户双因子查单走 `order_no = ? AND JSON_UNQUOTE(JSON_EXTRACT(customer_json,'$.phone')) = ?`。
- **catalog_entries**：`entry_id` 唯一、`type`、`payload_json`（LONGTEXT，内含规格基线）、时间戳。
- **users**：`username` 唯一、`password_hash`（PBKDF2 编码串，**绝不存明文**）、`role`、`display_name`、`active`、`must_change`、时间戳。客户端不入本表。
- **work_reports**（本期新增）：报工流水，**只插不改**；写入时冗余 `order_no/item_name/workshop`，看板聚合免 JOIN；索引 `order_id` 与 `created_at`。

无 MySQL 时设 `$env:STORAGE='memory'` 即可跑通全流程（重启数据丢失，账号也会重新播种）。

---

## 目录结构

```
furniture-showroom/
├── .env.user / .env.sales / .env.factory / .env.production   # 构建期角色
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.js
├── docs/
│   ├── blueprint.md                # **数字工厂蓝图（as-is/to-be 泳道 + 二期路线图）**
│   └── data-dictionary.md          # **数据字典（主数据/交易数据分层，字段级定义）**
├── public/models/                  # 内置 glTF/GLB 模型
├── src/
│   ├── App.tsx                     # 角色分流：销售→确认台；生产→hash 分流（确认台/#/report/#/board）；客户→展示端
│   ├── types.ts                    # Product（含 spec 规格主数据）/ PlacedItem / RoomConfig / FloorFinish / SavedScheme
│   ├── data/
│   │   ├── catalog.ts              # 内置商品基线（13 件均带规格基线）+ 运行时目录注册表
│   │   ├── floors.ts               # 内置地板基线 + 运行时地板注册表
│   │   └── rooms.ts                # 预设房间 + 用户自定义房间注册表
│   ├── store/
│   │   ├── useSceneStore.ts        # 场景状态：房间/物品/选中/视角/地板/方案
│   │   └── useCatalogStore.ts      # 目录同步：拉取条目→合并→写运行时注册表；条目增删改与上传；**规格基线落库**
│   ├── lib/
│   │   ├── api.ts                  # 后端客户端：**Bearer 注入 + 401 自动登出 + ApiError**；登录/改密/验证码/双因子查单/图纸鉴权下载
│   │   ├── auth.ts                 # **员工会话 store**：token 存 local/session、base64url 解码、本地判过期、getToken
│   │   ├── appRole.ts              # 构建期角色（user/sales/production）
│   │   ├── export.ts               # 文本/CSV 下载（自动加 BOM，Excel 打开不乱码）
│   │   ├── order.ts                # 状态标签配色、订单行聚合、**规格快照（只发公开字段）**与三视图组装、可行域校验、工单分组与工时汇总、CSV、查单凭据记忆
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
│       ├── LoginGate.tsx           # **员工登录门禁**：登录表单 / 角色不匹配拦截 / 强制首次改密
│       ├── Toolbar.tsx             # 房间/定制房间/地板/下单/我的订单/视角/变换/截图/方案
│       ├── Sidebar.tsx             # 商品库（运行时目录）
│       ├── Inspector.tsx           # 选中项属性（旋转/缩放/材质/复制/删除）
│       ├── FloorPicker.tsx         # 地板选择（内置 + 销售上传 + 本地自定义）
│       ├── RoomEditor.tsx          # 参数化房间定制（尺寸/门窗/参考照片）
│       ├── CheckoutModal.tsx       # 确认下单（客户信息 + 明细 + 可行域前置校验 + 毫米尺寸 + 3D 快照 + **图形验证码**）
│       ├── MyOrders.tsx            # 我的订单（**订单号 + 手机号双因子**查进度，含退回原因）
│       ├── AdminConsole.tsx        # 销售/生产确认台（页签：订单/商品库/地板）+ 工单/打印/退回 + **登录人/改密/退出 + 报工/看板入口**
│       ├── WorkOrder.tsx           # 生产工单面板 + 打印纸样（车间拆单/尺寸/工时/三视图/**图纸鉴权下载** + **报工二维码与行进度**）
│       ├── WorkReportH5.tsx        # **H5 扫码报工页**（BarcodeDetector 扫码/手动输单、开工领活、完工报数、本单流水）
│       ├── ShopBoard.tsx           # **车间看板**（大屏深色风，8s 轮询服务端聚合，卡片+车间进度表+流水）
│       ├── CatalogManager.tsx      # 商品库维护（上传替换模型/改价/新增/下架/还原 + 规格图纸入口）
│       ├── SpecEditor.tsx          # 规格主数据编辑（型号/主材/工艺/包装/工时/定制可行域/图纸上传）
│       ├── FloorManager.tsx        # 地板维护（上传/下架/删除）
│       ├── useFlash.ts             # 自动消失提示条 hook
│       ├── Overlays.tsx / icons.tsx
└── backend/                        # Go 服务
    ├── main.go                     # **路由分组（公开/员工/销售/生产/管理员）**+ 订单/目录/上传/验证码/双因子查单处理器
    ├── security.go                 # **CORS 白名单、token 签发与校验、staff/staffRoles/adminOnly 中间件、默认账号播种**
    ├── authapi.go                  # **登录/查自己/改密/开账号处理器 + 登录限流**
    ├── spec.go                     # **公开视图脱敏 + 规格快照服务端组装（composeSpec）**
    ├── spec_test.go                # **composeSpec / 脱敏 / 基线还原的单元测试**（`go test ./...`）
    ├── reportapi.go                # **报工与看板：校验链/超报防护/本地零点切日/车间聚合**
    ├── report_test.go              # **报工门禁/状态门禁/超报防护/看板聚合的单元测试**
    ├── captcha.go                  # **零依赖图形验证码**（5×7 点阵数字自绘 + 错切/干扰线/噪点 → PNG）
    ├── ratelimit.go                # **滑动窗口限流**（内存 map + Retry-After）与客户端 IP 取得
    ├── schema.sql                  # 建表参考（启动时自动执行）
    ├── uploads/                    # 上传资产（gitignore）
    └── internal/
        ├── auth/                   # **PBKDF2 密码散列 + HMAC token 签发/校验**（零第三方依赖）
        ├── model/                  # 订单与状态机、目录条目类型、**user.go：角色与动作级权限**、**report.go：报工模型**
        └── store/                  # Store 接口 + MySQL 实现（自动建库建表）+ 内存实现（含**账号、双因子 lookup、报工流水**）
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
| 员工端打开就是登录页，不知道密码 | 首次启动自动播种 `sales01`/`prod01`/`admin`，初始密码见**后端启动日志**（缺省 `Showroom@2026`） |
| 登录后被卡在「请修改初始密码」 | 播种账号带 `must_change`，**必须先改密才能进确认台**（此时后端只放行 `/api/me` 与 `/api/change-password`） |
| 提示「当前登录账号属于 XX 部，无权使用 YY 端」 | 拿错部门的账号登了另一个端：点「退出登录」换对应账号（`admin` 两端通用） |
| 用着用着突然回到登录页 | token 过期（默认 8 小时）；或**后端重启且未设 `AUTH_SECRET`**（随机密钥会使所有旧 token 失效）——正式部署请固定 `AUTH_SECRET` |
| 接口 **403**「XX部无权执行「YY」」 | 动作级权限拦截（如生产账号调 `sales_confirm`），换对应部门账号操作 |
| 接口 **403**「仍在用初始密码」 | 先调 `/api/change-password` 改密 |
| 下单报「验证码错误或已失效」 | 验证码是**一次性**的且 3 分钟过期（提交失败也会作废）：点图片换一张重填 |
| 下单/登录/查单报 **429** | 触发限流，按 `Retry-After` 头等待；登录连续失败会锁 10 分钟（按 IP 与用户名双维度） |
| 「我的订单」查不到 | 订单号与手机号**必须同时匹配**；后端故意不区分“订单不存在”与“手机号不对”，两者都返回同一文案 |
| 图纸点不开 / 返回 **401** | 图纸类扩展名需员工登录；自己拼 URL 或用 `<a download>` 都带不上 `Authorization` 头，请走应用内的下载按钮 |
| 生产工单里工艺/工时/主材全是「—」 | `catalog_entries` 里没有该商品的规格基线：让销售**登录一次销售端**（会自动落库），或在「商品库 → 规格/图纸」里补齐。已下单的旧订单快照无法回填 |
| 浏览器控制台报 CORS 错误 | `ALLOWED_ORIGINS` 未包含当前前端 Origin（缺省只放开本机 5173/5184/5175） |
| MySQL `Access denied` | 检查 `MYSQL_DSN`；PowerShell 中环境变量会跨命令残留，重启终端或显式重设 |
| 无 MySQL 环境 | `$env:STORAGE='memory'` 后启动后端（演示用；重启后账号也会重新播种） |
| 端口被占用 | 三个 dev 端口已用 `--strictPort` 固定（5173/5184/5175），占用时**直接报错**而非静默换端口：先关掉占用进程，或改 `package.json` 里的端口；后端 `$env:PORT='8081'` |
| 上传模型不显示 | 确认返回 `/uploads/...` 可访问、文件为 `.glb` 单文件含贴图、CORS 已放开该 Origin |
| 上传图纸报「不支持的文件类型」 | 允许：`.glb/.gltf`、`.png/.jpg/.jpeg/.webp`、`.pdf/.dwg/.dxf/.step/.stp/.iges/.igs/.zip`（单文件 ≤ 64 MB），清单见 `backend/main.go` 的 `allowedUploadExt` |
| 下单提交返回 400「超出工艺上限」 | 定制缩放越界：后端以目录条目的 `scaleMin/scaleMax` 为准（优先于前端），先让销售在「规格/图纸」里放宽可行域，或让客户调回尺寸 |
| 点「退回销售」报 400 | `reject` **必须填写原因**（弹框里取消或留空不会发请求，直接调 API 则被 400 拦下） |
| 工单面板提示「缺少型号/尺寸/工艺信息」 | 该订单在规格快照上线前创建，`items[].spec` 为空；无法回填，只能联系销售确认后线下排产 |
| 工单里三视图不显示 | 快照生成失败（如页面 canvas 受限）时 `spec.views` 为空字符串，不影响下单；以随单 CAD 图纸为准 |
| 报工页打不开摄像头 / 扫码无反应 | `BarcodeDetector` + 摄像头需要**安全上下文**（HTTPS 或 localhost）且 Chrome/Edge；手机访问局域网 IP 的 http 地址不支持，页面会提示改用**手动输入工单号**（二维码内容里的 `order=` 参数也会自动填入） |
| 报工提示「订单当前不在生产中」 | 仅 `in_production` 状态可报工（409）：先由生产在确认台点「生产确认·进入生产」 |
| 报工提示「本次最多再报 X 件」 | **超报防护**：工单行合格累计不得超过计划件数（废品不占额度）；确需补报先核对已报流水 |
| 看板没有读数 / 车间表为空 | 看板只统计**生产中**订单与报工流水；没有订单进入生产时就是空表，属正常现象 |
| 商品/地板改动未生效 | 用户端切走再切回页面（focus 触发刷新），或强制刷新 |

---

## 后续可扩展

二期主线（BOM/物料齐套、工序级报工、简易 APS 排程、ERP/BI 集成）已在 **[docs/blueprint.md](docs/blueprint.md)** 的 To-Be 蓝图与里程碑（M3–M5）中规划，不再重复列举。其他工程侧扩展项：

- 会话吊销与续期：token 黑名单/版本号、refresh token、管理员一键踢人下线
- 管理员账号管理界面（目前只能调 `POST /api/users` 开号）：停用/启用、重置密码、改角色、改显示名
- 操作审计日志表（谁在何时改了哪条目录/哪个价格），与限流计数器落 Redis 以支持多实例部署
- 报工看板推送化：轮询改 WebSocket/SSE，看板免刷新实时跳动；计件工资结算报表
- 客户端账号体系（注册 + 短信/邮箱验证码），把双因子查单升级为真正的“我的订单”；图纸水印与限时签名 URL
- CAD 图纸在线预览（PDF.js / STEP 轻量解析）
- 在线支付定金、订单取消/退款流程
- Dockerfile / docker-compose 一键部署，CI 流水线（typecheck + go test + 三端构建）
- 上传模型 Draco/meshopt 压缩 + CDN 分发、模型预览与校验
- AR（WebXR / model-viewer）实景预览、多方案云端保存与分享
