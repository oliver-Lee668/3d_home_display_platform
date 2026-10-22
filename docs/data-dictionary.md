# 数据字典

> 库：`furniture_showroom`（MySQL 8，utf8mb4）；建表脚本：[backend/schema.sql](../backend/schema.sql)
> 分层：**主数据**（低频变更、多单据共享）与 **交易数据**（随业务发生持续增长）。

## 0. 数据分层总览

| 层 | 表 | 增长特征 | 说明 |
|---|---|---|---|
| 主数据 | `catalog_entries` | 低（销售维护） | 商品/地板目录覆盖项 + 规格基线 |
| 主数据 | `users` | 极低（管理员维护） | 员工账号，客户不入本表 |
| 交易数据 | `orders` | 随下单增长 | 订单 + 规格快照 + 状态留痕 |
| 交易数据 | `work_reports` | 增长最快（每次报工一行） | 车间执行流水，看板聚合的唯一事实来源 |

关系（逻辑外键，未建物理 FK，聚合走冗余字段免 JOIN）：

```
catalog_entries ──(下单时 composeSpec 取基线)──► orders.items_json[].spec
orders.id / order_no ──► work_reports.order_id / order_no
orders.items 下标 i  ──► work_reports.item_index
users(登录 token)    ──► work_reports.worker、orders.history[].by
```

---

## 1. catalog_entries — 目录条目（主数据）

销售端对内置商品/地板的覆盖、新增、下架；`payload_json` 同时承载**规格基线**（工艺/工时/图纸等商业机密字段，下单时由服务端注入订单快照）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED PK | 自增主键 |
| entry_id | VARCHAR(64) UNIQUE | 业务键，如 `product:sofa-01` |
| type | VARCHAR(24) | `product_override` / `product_custom` / `product_disable` / `floor_custom` / `floor_disable` |
| payload_json | LONGTEXT | 条目内容；商品类含 spec 基线（见 §1.1） |
| created_at / updated_at | DATETIME | 维护时间 |

### 1.1 规格基线（payload_json.spec，服务端持有）

| 字段 | 类型 | 公开性 | 说明 |
|---|---|---|---|
| sku | string | 公开 | 型号编码 |
| category / group | string | group 公开 | 分类 / 车间分组（家具、家电、软装、其他） |
| baseSizeW/H/D | number(米) | 公开 | 标准外形尺寸，毫米换算的基准 |
| scaleMin / scaleMax | number | 公开 | 定制缩放可行域（前端滑杆限位同源） |
| materialSku | string | **机密** | 主材 SKU |
| colorCode | string | 机密 | 色号 |
| craft | string | **机密** | 工艺要求 |
| packing | string | 机密 | 包装规格 |
| laborMinutes | number | **机密** | 单件标准工时（分），看板折算工时的乘数 |
| drawings | [{name,url}] | **机密** | 图纸附件（按扩展名鉴权下载） |

> 公开字段会出现在客户端公开视图 `/api/entries`；机密字段仅进入员工可见的订单快照。

---

## 2. users — 员工账号（主数据）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED PK | 自增主键，token 的 `sub` |
| username | VARCHAR(64) UNIQUE | 登录名 |
| password_hash | VARCHAR(255) | `pbkdf2$<迭代>$<盐 b64>$<散列 b64>`，绝不存明文 |
| role | VARCHAR(16) | `sales` / `production` / `admin` |
| display_name | VARCHAR(64) | 显示名，写入留痕与报工 worker |
| active | TINYINT(1) | 停用开关 |
| must_change | TINYINT(1) | 1=仍在用初始密码，后端只放行 `/api/me` 与 `/api/change-password` |
| created_at / updated_at | DATETIME | — |

> 客户不是用户：客户端查单走「订单号 + 手机号」双因子，不注册、不入本表。

---

## 3. orders — 订单（交易数据）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED PK | 自增主键，报工流水的 order_id 指向它 |
| order_no | VARCHAR(32) UNIQUE | 单号 `SO<yyyyMMdd>-<序号>`，二维码/查单/看板展示均用它 |
| status | VARCHAR(32) | 见 §3.1 状态机 |
| customer_json | JSON | `{name, phone, note?}`；phone 参与双因子查单 |
| room_json | LONGTEXT | 安装空间 `{roomId, roomName, sizeW/D/H, floorLabel, snapshot?}`；snapshot 为 3D 截图 dataURL，体积大故 LONGTEXT |
| items_json | JSON | 订单行数组，见 §3.2 |
| history_json | JSON | 状态留痕数组 `[{status, by, at, note?}]`；by 取自操作者 token |
| total_amount | DECIMAL(10,2) | 订单金额 |
| created_at / updated_at | DATETIME | — |

### 3.1 状态机（status）

| 值 | 中文 | 允许动作（角色） |
|---|---|---|
| submitted | 已下单·待销售确认 | sales_confirm（销售/管理员）、reject |
| sales_confirmed | 销售已确认·待生产确认 | production_confirm（生产/管理员）、reject |
| in_production | 生产中 | complete（生产/管理员）、**可报工** |
| completed | 已完成 | 终态 |
| rejected | 已退回·待销售处理 | 销售处理后重新推进 |

### 3.2 订单行 items_json[]（下单瞬间冻结的快照）

| 字段 | 类型 | 说明 |
|---|---|---|
| productId / name | string | 商品标识与名称 |
| qty | int | 计划件数（**报工超报防护的额度**） |
| materialId / materialLabel | string | 材质选择 |
| scale | number | 定制缩放（1=标准） |
| unitPrice | number | 下单时单价 |
| spec | 对象 | 规格快照 = 客户端可见字段 + 服务端 composeSpec 注入的机密基线；sizeWmm/Hmm/Dmm 由服务端按 baseSize×scale 重算，客户端传值无效 |

---

## 4. work_reports — 车间报工流水（交易数据，本期新增）

**只插不改**：报工是事实记录，不允许 UPDATE/DELETE；工单进度与看板全部由本表聚合得出。

| 字段 | 类型 | 来源 | 说明 |
|---|---|---|---|
| id | BIGINT UNSIGNED PK | 自增 | — |
| order_id | BIGINT UNSIGNED | 请求体 | 逻辑外键 → orders.id；索引 idx_report_order |
| order_no | VARCHAR(32) | **写入时冗余** | 看板/流水免 JOIN 直接展示 |
| item_index | INT | 请求体 | 订单行下标（工单行），与 items_json 对齐 |
| item_name | VARCHAR(128) | **写入时冗余** | 行名快照，订单行改名不影响历史流水 |
| workshop | VARCHAR(64) | **写入时冗余** | 取订单行 spec.group，缺省「未分组」；车间分组聚合键 |
| action | VARCHAR(16) | 请求体 | `start`（开工领活）/ `complete`（完工报数） |
| qty_good | INT | 请求体 | 合格件数；complete 时 good+scrap ≥ 1；**累计不得超订单行 qty** |
| qty_scrap | INT | 请求体 | 废品件数；不占合格额度 |
| worker | VARCHAR(64) | **token** | `角色:显示名`（如 `生产部:生产01`），不可手填 |
| note | VARCHAR(255) | 请求体 | 备注，可空 |
| created_at | DATETIME | 库默认 | 报工时刻；索引 idx_report_created，看板「今日」按**本地时区零点**切日 |

### 4.1 写入校验链（POST /api/reports）

```
登录 token（401）→ 角色 ∈ {production, admin}（403）→ 订单存在（404）
→ status = in_production（409）→ item_index 在行范围内（400）
→ action 合法（400）→ complete 时 good+scrap ≥ 1（400）
→ 合格累计 + 本次 ≤ 计划件数（400，超报防护）→ 落库（201）
```

### 4.2 看板聚合口径（GET /api/dashboard）

| 读数 | 口径 |
|---|---|
| 在制订单/件数 | status=in_production 的订单数 / Σqty |
| 今日合格/废品/报工次数 | created_at ≥ 本地今日零点的 complete 流水聚合 |
| 今日折算工时 | Σ(今日合格件 × 该行 spec.laborMinutes) |
| 车间分组 | 在制订单行按 workshop 聚合：pieces/good/scrap/progress(=good÷pieces)/laborMinutes(=Σ spec.laborMinutes×qty)/订单去重数 |
| 最近报工 | 全量流水倒序前 12 条 |

---

## 5. API 一览（按数据归属）

| 端点 | 方法 | 权限 | 读写表 |
|---|---|---|---|
| /api/orders | POST | 公开（验证码+限流） | 写 orders；读 catalog_entries（composeSpec） |
| /api/orders | GET | staff | 读 orders |
| /api/orders/lookup | GET | 公开（双因子） | 读 orders |
| /api/orders/{id}/status | PATCH | staff + 动作级角色 | 写 orders（状态+留痕） |
| /api/reports | POST | production/admin | 写 work_reports；读 orders（校验） |
| /api/reports?orderId= | GET | staff | 读 work_reports |
| /api/dashboard | GET | staff | 读 orders + work_reports（内存聚合） |
| /api/entries | GET | 公开（脱敏视图） | 读 catalog_entries |
| /api/admin/entries/* | PUT/DELETE | sales/admin | 写 catalog_entries |
| /api/login、/api/me、/api/change-password | POST/GET | 见 README 安全边界 | 读写 users |
