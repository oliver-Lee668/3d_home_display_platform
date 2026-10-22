// 车间报工与看板的单元测试：走真实中间件链（签 token → 角色门禁 → 业务规则），
// 锁死"只有生产能报工、只有生产中能报工、合格数不得超报、读数汇总正确"这四条。
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"showroom-backend/internal/auth"
	"showroom-backend/internal/model"
	"showroom-backend/internal/store"
)

// newReportToken 在内存库里开一个账号并签发 token（withSession 会回查库复核）
func newReportToken(t *testing.T, role, name string) string {
	t.Helper()
	u := &model.User{Username: role + "-tester", Role: role, DisplayName: name, Active: true}
	if err := st.CreateUser(u); err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	tok, err := auth.Sign(auth.Claims{Sub: u.ID, User: u.Username, Role: role, Name: name, Iat: now, Exp: now + 3600}, authSecret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

// newProductionOrder 一张"生产中"的订单：家具行 2 件（工时 100）+ 家电行 1 件（工时 50）
func newProductionOrder(t *testing.T, status string) *model.Order {
	t.Helper()
	o := &model.Order{
		OrderNo:  "SO-TEST-0001",
		Status:   status,
		Customer: model.Customer{Name: "测试", Phone: "13800000000"},
		Items: []model.OrderItem{
			{Name: "sofa", Qty: 2, Spec: &model.ItemSpec{Group: "家具", LaborMinutes: 100}},
			{Name: "fridge", Qty: 1, Spec: &model.ItemSpec{Group: "家电", LaborMinutes: 50}},
		},
	}
	if err := st.Create(o); err != nil {
		t.Fatal(err)
	}
	return o
}

func postReport(t *testing.T, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "/api/reports", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	prodOnly := staffRoles(model.RoleProduction, model.RoleAdmin)
	prodOnly(handleAddReport)(w, r)
	return w
}

func TestAddReportRequiresLogin(t *testing.T) {
	st = store.NewMemory()
	r := httptest.NewRequest("POST", "/api/reports", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	staffRoles(model.RoleProduction, model.RoleAdmin)(handleAddReport)(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("无 token 报工 = %d，期望 401", w.Code)
	}
}

func TestAddReportRoleGate(t *testing.T) {
	st = store.NewMemory()
	o := newProductionOrder(t, model.StatusInProduction)
	body := `{"orderId":` + itoa(o.ID) + `,"itemIndex":0,"action":"start"}`

	if w := postReport(t, newReportToken(t, model.RoleSales, "销售01"), body); w.Code != http.StatusForbidden {
		t.Errorf("销售角色报工 = %d，期望 403", w.Code)
	}
	if w := postReport(t, newReportToken(t, model.RoleProduction, "生产01"), body); w.Code != http.StatusCreated {
		t.Errorf("生产角色开工 = %d（%s），期望 201", w.Code, w.Body.String())
	}
}

func TestAddReportStatusGate(t *testing.T) {
	st = store.NewMemory()
	o := newProductionOrder(t, model.StatusSubmitted)
	tok := newReportToken(t, model.RoleProduction, "生产01")
	w := postReport(t, tok, `{"orderId":`+itoa(o.ID)+`,"itemIndex":0,"action":"start"}`)
	if w.Code != http.StatusConflict {
		t.Errorf("未进入生产就报工 = %d，期望 409", w.Code)
	}
}

func TestAddReportOverReportGuard(t *testing.T) {
	st = store.NewMemory()
	o := newProductionOrder(t, model.StatusInProduction)
	tok := newReportToken(t, model.RoleProduction, "生产01")

	w := postReport(t, tok, `{"orderId":`+itoa(o.ID)+`,"itemIndex":0,"action":"complete","qtyGood":2}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("报满 2 件合格 = %d（%s），期望 201", w.Code, w.Body.String())
	}
	var first struct {
		Progress struct {
			Planned int `json:"planned"`
			Good    int `json:"good"`
		} `json:"progress"`
		Report model.WorkReport `json:"report"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	if first.Progress.Planned != 2 || first.Progress.Good != 2 {
		t.Errorf("进度 = %+v，期望 planned=2 good=2", first.Progress)
	}
	// 报工人取自 token，不可手填
	if first.Report.Worker != "生产部:生产01" {
		t.Errorf("worker = %q，期望 生产部:生产01", first.Report.Worker)
	}
	// 冗余落库的车间分组来自规格基线
	if first.Report.Workshop != "家具" {
		t.Errorf("workshop = %q，期望 家具", first.Report.Workshop)
	}

	w = postReport(t, tok, `{"orderId":`+itoa(o.ID)+`,"itemIndex":0,"action":"complete","qtyGood":1}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("超报合格数 = %d（%s），期望 400", w.Code, w.Body.String())
	}
	// 废品不占合格额度，但至少要报 1 件
	w = postReport(t, tok, `{"orderId":`+itoa(o.ID)+`,"itemIndex":0,"action":"complete","qtyGood":0,"qtyScrap":1}`)
	if w.Code != http.StatusCreated {
		t.Errorf("报废品 = %d（%s），期望 201", w.Code, w.Body.String())
	}
	w = postReport(t, tok, `{"orderId":`+itoa(o.ID)+`,"itemIndex":0,"action":"complete","qtyGood":0,"qtyScrap":0}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("合格与废品都为 0 = %d，期望 400", w.Code)
	}
}

func TestDashboardAggregates(t *testing.T) {
	st = store.NewMemory()
	o := newProductionOrder(t, model.StatusInProduction)
	newProductionOrder(t, model.StatusRejected) // 退回中的单子只计入 rejected
	if err := st.AddReport(&model.WorkReport{
		OrderID: o.ID, OrderNo: o.OrderNo, ItemIndex: 0, ItemName: "sofa",
		Workshop: "家具", Action: model.ReportComplete, QtyGood: 1, Worker: "生产部:生产01",
	}); err != nil {
		t.Fatal(err)
	}

	r := httptest.NewRequest("GET", "/api/dashboard", nil)
	r.Header.Set("Authorization", "Bearer "+newReportToken(t, model.RoleProduction, "生产01"))
	w := httptest.NewRecorder()
	staff(handleDashboard)(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("dashboard = %d（%s），期望 200", w.Code, w.Body.String())
	}
	var d dashboardResp
	if err := json.Unmarshal(w.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.InProduction != 1 || d.InProductionPieces != 3 {
		t.Errorf("在制 = %d 单 %d 件，期望 1 单 3 件", d.InProduction, d.InProductionPieces)
	}
	if d.Rejected != 1 {
		t.Errorf("退回中 = %d，期望 1", d.Rejected)
	}
	if d.TodayGood != 1 || d.TodayLaborMinutes != 100 {
		t.Errorf("今日合格 = %d 折算工时 = %d，期望 1 / 100", d.TodayGood, d.TodayLaborMinutes)
	}
	if len(d.Workshops) != 2 {
		t.Fatalf("车间分组 = %d，期望 2", len(d.Workshops))
	}
	// 按车间名排序：家具在前
	f := d.Workshops[0]
	if f.Workshop != "家具" || f.Pieces != 2 || f.Good != 1 || f.Progress != 0.5 || f.LaborMinutes != 200 {
		t.Errorf("家具车间读数 = %+v，期望 pieces=2 good=1 progress=0.5 labor=200", f)
	}
	if d.Workshops[1].Good != 0 || d.Workshops[1].Progress != 0 {
		t.Errorf("家电车间读数 = %+v，期望 good=0 progress=0", d.Workshops[1])
	}
	if len(d.Recent) != 1 {
		t.Errorf("recent = %d 条，期望 1", len(d.Recent))
	}
}

func TestDayBeginLocalMidnight(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	morning := time.Date(2026, 10, 13, 7, 30, 0, 0, loc)
	got := dayBegin(morning)
	want := time.Date(2026, 10, 13, 0, 0, 0, 0, loc)
	if !got.Equal(want) {
		t.Errorf("dayBegin(07:30 +08:00) = %v，期望 %v", got, want)
	}
	// 东八区 23:00 仍属当天（若误用 UTC 边界，00:00~07:59 会被算成"昨天"）
	late := time.Date(2026, 10, 13, 23, 0, 0, 0, loc)
	if !dayBegin(late).Equal(want) {
		t.Errorf("dayBegin(23:00 +08:00) = %v，期望 %v", dayBegin(late), want)
	}
}

// itoa 测试用的小工具
func itoa(v int64) string { return strconv.FormatInt(v, 10) }
