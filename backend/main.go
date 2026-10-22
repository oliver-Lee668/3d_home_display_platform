// 定制订单后端：用户下单 -> 销售确认 -> 生产确认 -> 进入生产
// 运行：STORAGE=mysql(默认)/memory  MYSQL_DSN=...  PORT=8080  go run .
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"showroom-backend/internal/model"
	"showroom-backend/internal/store"
)

// uploadDir 上传文件目录（相对 backend 工作目录，对外映射到 /uploads/）
const uploadDir = "uploads"

var (
	st          store.Store
	storageMode string
	orderSeq    atomic.Int64
)

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	storageMode = envOr("STORAGE", "mysql")
	dsn := envOr("MYSQL_DSN", "root:123456@tcp(127.0.0.1:3306)/furniture_showroom?parseTime=true&charset=utf8mb4")

	if storageMode == "memory" {
		st = store.NewMemory()
		log.Println("[warn] STORAGE=memory：内存演示模式，重启即失；生产请配置 MySQL")
	} else {
		s, err := store.NewMySQL(dsn)
		if err != nil {
			log.Fatalf("[fatal] 连接 MySQL 失败：%v\n请先执行 schema.sql 建库建表，或通过 MYSQL_DSN 环境变量配置连接串", err)
		}
		st = s
		log.Println("[ok] MySQL 已连接：", dsn)
	}
	orderSeq.Store(time.Now().UnixNano() % 10000)

	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatalf("[fatal] 创建上传目录失败：%v", err)
	}
	seedUsers()

	mux := http.NewServeMux()

	// ---- 公开接口（客户免登录）----
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/login", handleLogin)
	mux.HandleFunc("GET /api/captcha", handleCaptcha)
	mux.HandleFunc("POST /api/orders", handleCreateOrder)       // 限流 + 图形验证码
	mux.HandleFunc("GET /api/orders/lookup", handleLookupOrder) // 订单号 + 手机号双因子
	mux.HandleFunc("GET /api/entries", handleListEntries)       // 未登录自动脱敏

	// ---- 员工接口（需登录；目录写入仅限销售/管理员）----
	salesOnly := staffRoles(model.RoleSales, model.RoleAdmin)
	mux.HandleFunc("GET /api/me", staff(handleMe))
	mux.HandleFunc("POST /api/change-password", staff(handleChangePassword))
	mux.HandleFunc("GET /api/orders", staff(handleListOrders))
	mux.HandleFunc("GET /api/orders/{id}", staff(handleGetOrder))
	mux.HandleFunc("PATCH /api/orders/{id}/status", staff(handleUpdateStatus))
	// ---- 车间执行层：报工仅生产/管理员；流水与看板任意员工可读 ----
	prodOnly := staffRoles(model.RoleProduction, model.RoleAdmin)
	mux.HandleFunc("POST /api/reports", prodOnly(handleAddReport))
	mux.HandleFunc("GET /api/reports", staff(handleListReports))
	mux.HandleFunc("GET /api/dashboard", staff(handleDashboard))
	mux.HandleFunc("POST /api/users", adminOnly(handleCreateUser))
	mux.HandleFunc("POST /api/admin/entries", salesOnly(handleUpsertEntry))
	mux.HandleFunc("PUT /api/admin/entries/{entryId}", salesOnly(handleUpsertEntryPath))
	mux.HandleFunc("DELETE /api/admin/entries/{entryId}", salesOnly(handleDeleteEntry))
	mux.HandleFunc("POST /api/admin/upload", salesOnly(handleUpload))
	mux.HandleFunc("GET /uploads/", handleUploadAsset)

	addr := ":" + envOr("PORT", "8080")
	log.Println("订单服务监听", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"storage": storageMode,
		"db":      st.Ping() == nil,
	})
}

type createReq struct {
	Customer    model.Customer     `json:"customer"`
	Room        model.RoomSnapshot `json:"room"`
	Items       []model.OrderItem  `json:"items"`
	TotalAmount float64            `json:"totalAmount"`
	// 图形验证码：下单是公开接口，靠它挡住脚本刷单
	CaptchaID     string `json:"captchaId"`
	CaptchaAnswer string `json:"captchaAnswer"`
}

// 下单限流：同一 IP 每小时最多 10 单，同一手机号每小时最多 5 单
const (
	orderIPWindow    = time.Hour
	orderIPMax       = 10
	orderPhoneWindow = time.Hour
	orderPhoneMax    = 5
)

func handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	ipKey := "order-ip:" + ip
	if !rateLimiter.allow(ipKey, orderIPWindow, orderIPMax) {
		w.Header().Set("Retry-After", strconv.Itoa(rateLimiter.retryAfter(ipKey, orderIPWindow)))
		writeErr(w, http.StatusTooManyRequests, "下单过于频繁，请稍后再试或联系销售")
		return
	}

	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	if req.Customer.Name == "" || req.Customer.Phone == "" {
		writeErr(w, http.StatusBadRequest, "客户姓名与手机号必填")
		return
	}
	if len(req.Items) == 0 {
		writeErr(w, http.StatusBadRequest, "订单至少包含一件商品")
		return
	}
	// 验证码一次性消费：无论后续校验是否通过都作废，不可重放
	if !captchas.consume(req.CaptchaID, req.CaptchaAnswer) {
		writeErr(w, http.StatusBadRequest, "验证码不正确或已失效，请重新输入")
		return
	}
	phoneKey := "order-phone:" + strings.TrimSpace(req.Customer.Phone)
	if !rateLimiter.allow(phoneKey, orderPhoneWindow, orderPhoneMax) {
		w.Header().Set("Retry-After", strconv.Itoa(rateLimiter.retryAfter(phoneKey, orderPhoneWindow)))
		writeErr(w, http.StatusTooManyRequests, "该手机号下单过于频繁，请稍后再试")
		return
	}

	// 规格快照由服务端组装：可行域以目录主数据为准，毫米尺寸重算，
	// 工艺/包装/工时/主材/图纸等机密字段只从服务端基线取，客户端提交的一律丢弃。
	baselines, berr := specBaselines()
	if berr != nil {
		log.Println("[warn] 读取规格主数据失败，本次下单将缺少工艺与图纸信息：", berr)
	}
	for i := range req.Items {
		it := &req.Items[i]
		if it.Scale <= 0 {
			it.Scale = 1
		}
		base := baselines[it.ProductID]
		if base != nil {
			if base.ScaleMin > 0 && it.Scale < base.ScaleMin-1e-9 {
				writeErr(w, http.StatusBadRequest, fmt.Sprintf(
					"「%s」定制缩放 %.2f 低于工艺下限 %.2f（允许 ×%.2f ~ ×%.2f），请调整后重新下单",
					it.Name, it.Scale, base.ScaleMin, base.ScaleMin, base.ScaleMax))
				return
			}
			if base.ScaleMax > 0 && it.Scale > base.ScaleMax+1e-9 {
				writeErr(w, http.StatusBadRequest, fmt.Sprintf(
					"「%s」定制缩放 %.2f 超出工艺上限 %.2f（允许 ×%.2f ~ ×%.2f），请调整后重新下单",
					it.Name, it.Scale, base.ScaleMax, base.ScaleMin, base.ScaleMax))
				return
			}
		}
		it.Spec = composeSpec(it.Spec, base, it.Scale)
	}
	o := &model.Order{
		OrderNo:     genOrderNo(),
		Status:      model.StatusSubmitted,
		Customer:    req.Customer,
		Room:        req.Room,
		Items:       req.Items,
		TotalAmount: req.TotalAmount,
		History: []model.HistoryEntry{{
			Status: model.StatusSubmitted,
			By:     req.Customer.Name,
			At:     time.Now(),
			Note:   "用户提交定制订单",
		}},
	}
	if err := st.Create(o); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建订单失败: "+err.Error())
		return
	}
	log.Printf("[order] %s 新建订单 %s（%d 行，¥%.2f）来自 %s", req.Customer.Name, o.OrderNo, len(o.Items), o.TotalAmount, ip)
	writeJSON(w, http.StatusCreated, o)
}

// handleCaptcha 签发一张图形验证码（公开接口，限流）
func handleCaptcha(w http.ResponseWriter, r *http.Request) {
	key := "captcha-ip:" + clientIP(r)
	if !rateLimiter.allow(key, 10*time.Minute, 60) {
		w.Header().Set("Retry-After", strconv.Itoa(rateLimiter.retryAfter(key, 10*time.Minute)))
		writeErr(w, http.StatusTooManyRequests, "验证码请求过于频繁，请稍后再试")
		return
	}
	id, dataURL, err := captchas.issue()
	if err != nil {
		writeErr(w, http.StatusServiceUnavailable, "验证码暂不可用："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"image":     dataURL,
		"expiresIn": int(captchaTTL.Seconds()),
	})
}

// handleLookupOrder 客户端自助查单：必须同时提供订单号与下单手机号。
// 只凭手机号可查全部订单是不可接受的（号段可枚举、销售手里就有客户号码）。
func handleLookupOrder(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	key := "lookup-ip:" + ip
	if !rateLimiter.allow(key, lookupWindow, lookupMax) {
		w.Header().Set("Retry-After", strconv.Itoa(rateLimiter.retryAfter(key, lookupWindow)))
		writeErr(w, http.StatusTooManyRequests, "查询过于频繁，请稍后再试")
		return
	}
	orderNo := strings.TrimSpace(r.URL.Query().Get("orderNo"))
	phone := strings.TrimSpace(r.URL.Query().Get("phone"))
	if orderNo == "" || phone == "" {
		writeErr(w, http.StatusBadRequest, "请同时提供订单号与下单手机号")
		return
	}
	list, err := st.Lookup(orderNo, phone)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	if len(list) == 0 {
		// 不区分“订单不存在”与“手机号不匹配”，避免被用来探测订单号是否存在
		writeErr(w, http.StatusNotFound, "未找到与该订单号、手机号匹配的订单")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func genOrderNo() string {
	n := orderSeq.Add(1) % 10000
	return "SO" + time.Now().Format("20060102") + "-" + fmt.Sprintf("%04d", n)
}

// toMM 米转毫米（四舍五入）
func toMM(meters float64) int { return int(math.Round(meters * 1000)) }

func handleListOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	phone := r.URL.Query().Get("phone")
	list, err := st.List(status, phone)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func handleGetOrder(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "非法订单 ID")
		return
	}
	o, err := st.Get(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, o)
}

type statusReq struct {
	Action string `json:"action"`
	By     string `json:"by"` // 已废弃：操作人一律取自登录 token，前端传什么都会被覆盖
	Note   string `json:"note"`
}

func handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "非法订单 ID")
		return
	}
	var req statusReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	c := claimsOf(r)
	// 动作级权限：只校状态机不够，生产角色不能代销售确认
	if !model.KnownAction(req.Action) {
		writeErr(w, http.StatusBadRequest, "未知动作: "+req.Action)
		return
	}
	if !model.CanPerformAction(c.Role, req.Action) {
		writeErr(w, http.StatusForbidden,
			fmt.Sprintf("%s无权执行「%s」", model.RoleLabel[c.Role], model.ActionLabel[req.Action]))
		return
	}
	if model.NeedsNote(req.Action) && strings.TrimSpace(req.Note) == "" {
		writeErr(w, http.StatusBadRequest, "退回必须填写原因")
		return
	}
	o, err := st.Get(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	next, err := model.NextStatus(o.Status, req.Action)
	if err != nil {
		writeErr(w, http.StatusConflict, err.Error())
		return
	}
	o.Status = next
	// 操作人取自 token（可追溯到真实账号），不再相信前端传来的名字
	o.History = append(o.History, model.HistoryEntry{
		Status: next,
		By:     model.RoleLabel[c.Role] + ":" + c.Name,
		At:     time.Now(),
		Note:   req.Note,
	})
	if err := st.Save(o); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	log.Printf("[order] %s(%s) 将订单 %s %s → %s", c.Name, c.Role, o.OrderNo, model.ActionLabel[req.Action], next)
	writeJSON(w, http.StatusOK, o)
}

// ---------------- 目录条目 ----------------

// handleListEntries 目录条目。未登录（客户端）返回脱敏视图：
// spec 里的工艺、包装、工时、主材编码与图纸清单一律剔除，只留型号与定制可行域。
func handleListEntries(w http.ResponseWriter, r *http.Request) {
	list, err := st.ListEntries()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "查询目录条目失败: "+err.Error())
		return
	}
	if parseClaims(r) == nil {
		list = sanitizeEntries(list)
	}
	writeJSON(w, http.StatusOK, list)
}

type entryReq struct {
	EntryID string          `json:"entryId"`
	Type    model.EntryType `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func validEntryType(t model.EntryType) bool {
	switch t {
	case model.EntryProductOverride, model.EntryProductCustom, model.EntryProductDisable,
		model.EntryFloorCustom, model.EntryFloorDisable:
		return true
	}
	return false
}

func upsertEntry(w http.ResponseWriter, pathID string, r *http.Request) {
	var req entryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	id := pathID
	if id == "" {
		id = req.EntryID
	}
	if id == "" || !validEntryType(req.Type) {
		writeErr(w, http.StatusBadRequest, "需要 entryId 与合法的 type")
		return
	}
	e := &model.CatalogEntry{EntryID: id, Type: req.Type, Payload: req.Payload}
	if err := st.UpsertEntry(e); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func handleUpsertEntry(w http.ResponseWriter, r *http.Request) { upsertEntry(w, "", r) }

func handleUpsertEntryPath(w http.ResponseWriter, r *http.Request) {
	upsertEntry(w, r.PathValue("entryId"), r)
}

func handleDeleteEntry(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("entryId")
	if err := st.DeleteEntry(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "entryId": id})
}

var allowedUploadExt = map[string]bool{
	// 模型与贴图
	".glb": true, ".gltf": true, ".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
	// 图纸/工艺文件
	".pdf": true, ".dwg": true, ".dxf": true, ".step": true, ".stp": true,
	".iges": true, ".igs": true, ".zip": true,
}

// drawingExts 属于生产机密的图纸类文件：下载必须持员工会话。
// 模型与贴图仍公开（客户端要渲染商品与地板），仅按扩展名区分。
var drawingExts = map[string]bool{
	".pdf": true, ".dwg": true, ".dxf": true, ".step": true, ".stp": true,
	".iges": true, ".igs": true, ".zip": true,
}

// handleUploadAsset 上传资产静态服务：图纸类需登录，且强制作为附件下载。
func handleUploadAsset(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/uploads/")
	// 防目录穿越：清之后的路径不得再包含分隔符或上级引用
	if name == "" || name != filepath.Base(filepath.Clean(name)) || strings.Contains(name, "..") {
		writeErr(w, http.StatusBadRequest, "非法路径")
		return
	}
	if drawingExts[strings.ToLower(filepath.Ext(name))] {
		if parseClaims(r) == nil {
			writeErr(w, http.StatusUnauthorized, "图纸仅限已登录员工下载")
			return
		}
		w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	}
	// 不尝试推断 MIME，避免上传的 SVG/HTML 被当作页面执行造成 XSS
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))).ServeHTTP(w, r)
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 最大 64MB
		writeErr(w, http.StatusBadRequest, "解析上传失败: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "缺少 file 字段")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedUploadExt[ext] {
		writeErr(w, http.StatusBadRequest, "不支持的文件类型 "+ext+"（允许 glb/gltf/png/jpg/jpeg/webp/pdf/dwg/dxf/step/stp/iges/igs/zip）")
		return
	}
	name := fmt.Sprintf("%d-%d%s", time.Now().UnixNano(), orderSeq.Add(1), ext)
	dst, err := os.Create(filepath.Join(uploadDir, name))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "创建文件失败: "+err.Error())
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		writeErr(w, http.StatusInternalServerError, "写入文件失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url":  "/" + uploadDir + "/" + name,
		"name": header.Filename,
		"size": header.Size,
	})
}
