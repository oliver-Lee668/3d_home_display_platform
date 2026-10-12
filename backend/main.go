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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/orders", handleCreateOrder)
	mux.HandleFunc("GET /api/orders", handleListOrders)
	mux.HandleFunc("GET /api/orders/{id}", handleGetOrder)
	mux.HandleFunc("PATCH /api/orders/{id}/status", handleUpdateStatus)

	// 目录条目：销售端上传/替换商品与地板，用户端拉取后与内置基线合并
	mux.HandleFunc("GET /api/entries", handleListEntries)
	mux.HandleFunc("POST /api/admin/entries", handleUpsertEntry)
	mux.HandleFunc("PUT /api/admin/entries/{entryId}", handleUpsertEntryPath)
	mux.HandleFunc("DELETE /api/admin/entries/{entryId}", handleDeleteEntry)
	mux.HandleFunc("POST /api/admin/upload", handleUpload)
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

	addr := ":" + envOr("PORT", "8080")
	log.Println("订单服务监听", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

// cors 允许前端跨域调用（开发期全放开）
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
}

func handleCreateOrder(w http.ResponseWriter, r *http.Request) {
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

	// 依据目录主数据校验定制尺寸可行域，并以服务端重算冻结规格（防前端篡改）
	limits, lerr := specLimits()
	if lerr != nil {
		log.Println("[warn] 读取规格可行域失败，跳过校验：", lerr)
	}
	for i := range req.Items {
		it := &req.Items[i]
		if it.Scale <= 0 {
			it.Scale = 1
		}
		lm := limits[it.ProductID]
		if lm.min > 0 && it.Scale < lm.min-1e-9 {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf(
				"「%s」定制缩放 %.2f 低于工艺下限 %.2f，请调整后重新下单", it.Name, it.Scale, lm.min))
			return
		}
		if lm.max > 0 && it.Scale > lm.max+1e-9 {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf(
				"「%s」定制缩放 %.2f 超出工艺上限 %.2f，请调整后重新下单", it.Name, it.Scale, lm.max))
			return
		}
		if it.Spec != nil {
			it.Spec.SizeWMM = toMM(it.Spec.BaseSizeW * it.Scale)
			it.Spec.SizeHMM = toMM(it.Spec.BaseSizeH * it.Scale)
			it.Spec.SizeDMM = toMM(it.Spec.BaseSizeD * it.Scale)
			it.Spec.ScaleMin = lm.min
			it.Spec.ScaleMax = lm.max
		}
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
	writeJSON(w, http.StatusCreated, o)
}

func genOrderNo() string {
	n := orderSeq.Add(1) % 10000
	return "SO" + time.Now().Format("20060102") + "-" + fmt.Sprintf("%04d", n)
}

// toMM 米转毫米（四舍五入）
func toMM(meters float64) int { return int(math.Round(meters * 1000)) }

type scaleLimit struct{ min, max float64 }

// specLimits 从目录条目中汇总每个商品的定制缩放可行域（销售端维护的规格主数据）
func specLimits() (map[string]scaleLimit, error) {
	out := map[string]scaleLimit{}
	list, err := st.ListEntries()
	if err != nil {
		return out, err
	}
	for _, e := range list {
		if e.Type != model.EntryProductOverride && e.Type != model.EntryProductCustom {
			continue
		}
		if len(e.Payload) == 0 {
			continue
		}
		var p struct {
			ID   string `json:"id"`
			Spec *struct {
				ScaleMin float64 `json:"scaleMin"`
				ScaleMax float64 `json:"scaleMax"`
			} `json:"spec"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil || p.ID == "" || p.Spec == nil {
			continue
		}
		out[p.ID] = scaleLimit{min: p.Spec.ScaleMin, max: p.Spec.ScaleMax}
	}
	return out, nil
}

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
	By     string `json:"by"`
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
	o.History = append(o.History, model.HistoryEntry{
		Status: next,
		By:     req.By,
		At:     time.Now(),
		Note:   req.Note,
	})
	if err := st.Save(o); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, o)
}

// ---------------- 目录条目 ----------------

func handleListEntries(w http.ResponseWriter, _ *http.Request) {
	list, err := st.ListEntries()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "查询目录条目失败: "+err.Error())
		return
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
