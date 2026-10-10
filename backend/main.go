// 定制订单后端：用户下单 -> 销售确认 -> 生产确认 -> 进入生产
// 运行：STORAGE=mysql(默认)/memory  MYSQL_DSN=...  PORT=8080  go run .
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"

	"showroom-backend/internal/model"
	"showroom-backend/internal/store"
)

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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/orders", handleCreateOrder)
	mux.HandleFunc("GET /api/orders", handleListOrders)
	mux.HandleFunc("GET /api/orders/{id}", handleGetOrder)
	mux.HandleFunc("PATCH /api/orders/{id}/status", handleUpdateStatus)

	addr := ":" + envOr("PORT", "8080")
	log.Println("订单服务监听", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}

// cors 允许前端跨域调用（开发期全放开）
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
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
