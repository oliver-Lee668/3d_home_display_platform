// 车间报工与车间看板接口：数字工厂的执行层。
// 工单打印出去只是"纸"，报工把车间执行闭环回系统；看板把执行读数汇总给管理层。
// 报工人一律取自登录 token（与流转历史同规则），不可手填、不可伪造。
package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"

	"showroom-backend/internal/model"
)

type reportReq struct {
	OrderID   int64  `json:"orderId"`
	ItemIndex int    `json:"itemIndex"`
	Action    string `json:"action"`
	QtyGood   int    `json:"qtyGood"`
	QtyScrap  int    `json:"qtyScrap"`
	Note      string `json:"note"`
}

// reportProgress 某个工单行的报工进度（计划/已报合格/废品）
type reportProgress struct {
	Planned int `json:"planned"`
	Good    int `json:"good"`
	Scrap   int `json:"scrap"`
}

func reportProgressOf(reports []*model.WorkReport, orderID int64, itemIndex, planned int) reportProgress {
	p := reportProgress{Planned: planned}
	for _, r := range reports {
		if r.OrderID != orderID || r.ItemIndex != itemIndex || r.Action != model.ReportComplete {
			continue
		}
		p.Good += r.QtyGood
		p.Scrap += r.QtyScrap
	}
	return p
}

// handleAddReport 车间报工：开工领活 / 完工报数。仅生产角色与管理员。
func handleAddReport(w http.ResponseWriter, r *http.Request) {
	var req reportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	if !model.KnownReportAction(req.Action) {
		writeErr(w, http.StatusBadRequest, "未知的报工动作")
		return
	}
	o, err := st.Get(req.OrderID)
	if err != nil || o == nil {
		writeErr(w, http.StatusNotFound, "订单不存在")
		return
	}
	// 只有"生产中"的订单才在车间执行；未确认或已完工的单子报工属于流程错误
	if o.Status != model.StatusInProduction {
		writeErr(w, http.StatusConflict, "订单当前不在生产中，无法报工")
		return
	}
	if req.ItemIndex < 0 || req.ItemIndex >= len(o.Items) {
		writeErr(w, http.StatusBadRequest, "工单行不存在")
		return
	}
	it := o.Items[req.ItemIndex]

	rep := &model.WorkReport{
		OrderID:   o.ID,
		OrderNo:   o.OrderNo,
		ItemIndex: req.ItemIndex,
		ItemName:  it.Name,
		Action:    req.Action,
		Note:      req.Note,
	}
	if it.Spec != nil && it.Spec.Group != "" {
		rep.Workshop = it.Spec.Group
	} else {
		rep.Workshop = "未分组"
	}

	if req.Action == model.ReportComplete {
		if req.QtyGood < 0 || req.QtyScrap < 0 || req.QtyGood+req.QtyScrap < 1 {
			writeErr(w, http.StatusBadRequest, "完工报工至少填写 1 件合格或废品")
			return
		}
		existing, lerr := st.ListReports(o.ID)
		if lerr != nil {
			writeErr(w, http.StatusInternalServerError, "读取报工流水失败: "+lerr.Error())
			return
		}
		// 超报防护：合格数累计不得超过计划件数，否则看板进度会超过 100%
		prog := reportProgressOf(existing, o.ID, req.ItemIndex, it.Qty)
		if prog.Good+req.QtyGood > it.Qty {
			writeErr(w, http.StatusBadRequest, strconv.Itoa(it.Qty)+" 件的活已报合格 "+
				strconv.Itoa(prog.Good)+" 件，本次最多再报 "+strconv.Itoa(it.Qty-prog.Good)+" 件")
			return
		}
		rep.QtyGood = req.QtyGood
		rep.QtyScrap = req.QtyScrap
	}

	c := claimsOf(r)
	rep.Worker = model.RoleLabel[c.Role] + ":" + c.Name
	if err := st.AddReport(rep); err != nil {
		writeErr(w, http.StatusInternalServerError, "报工失败: "+err.Error())
		return
	}
	reports, _ := st.ListReports(o.ID)
	writeJSON(w, http.StatusCreated, map[string]any{
		"report":   rep,
		"progress": reportProgressOf(reports, o.ID, req.ItemIndex, it.Qty),
	})
}

// handleListReports 某订单的报工流水（工单面板与 H5 报工页共用）
func handleListReports(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.URL.Query().Get("orderId"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, http.StatusBadRequest, "缺少 orderId")
		return
	}
	list, err := st.ListReports(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取报工流水失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// workshopStat 看板上的车间分组读数
type workshopStat struct {
	Workshop     string  `json:"workshop"`
	Orders       int     `json:"orders"`
	Pieces       int     `json:"pieces"`
	Good         int     `json:"good"`
	Scrap        int     `json:"scrap"`
	Progress     float64 `json:"progress"`
	LaborMinutes int     `json:"laborMinutes"`
}

type dashboardResp struct {
	InProduction       int                 `json:"inProduction"`
	InProductionPieces int                 `json:"inProductionPieces"`
	Rejected           int                 `json:"rejected"`
	TodayReports       int                 `json:"todayReports"`
	TodayGood          int                 `json:"todayGood"`
	TodayScrap         int                 `json:"todayScrap"`
	TodayLaborMinutes  int                 `json:"todayLaborMinutes"`
	Workshops          []*workshopStat     `json:"workshops"`
	Recent             []*model.WorkReport `json:"recent"`
}

// handleDashboard 车间看板读数：在制/今日完工/今日废品/折算工时/车间进度/最新报工流水
func handleDashboard(w http.ResponseWriter, r *http.Request) {
	orders, err := st.List("", "")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取订单失败: "+err.Error())
		return
	}
	reports, err := st.ListAllReports(0)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取报工流水失败: "+err.Error())
		return
	}

	byID := make(map[int64]*model.Order, len(orders))
	for _, o := range orders {
		byID[o.ID] = o
	}
	// 每个工单行的合格/废品累计
	type rowKey struct {
		orderID int64
		item    int
	}
	rowGood := map[rowKey]int{}
	rowScrap := map[rowKey]int{}
	for _, rep := range reports {
		if rep.Action != model.ReportComplete {
			continue
		}
		k := rowKey{rep.OrderID, rep.ItemIndex}
		rowGood[k] += rep.QtyGood
		rowScrap[k] += rep.QtyScrap
	}

	dayStart := dayBegin(time.Now())
	resp := dashboardResp{Workshops: []*workshopStat{}}
	wsMap := map[string]*workshopStat{}

	for _, o := range orders {
		if o.Status == model.StatusRejected {
			resp.Rejected++
		}
		if o.Status != model.StatusInProduction {
			continue
		}
		resp.InProduction++
		for i, it := range o.Items {
			resp.InProductionPieces += it.Qty
			group := "未分组"
			labor := 0
			if it.Spec != nil {
				if it.Spec.Group != "" {
					group = it.Spec.Group
				}
				labor = it.Spec.LaborMinutes
			}
			ws, ok := wsMap[group]
			if !ok {
				ws = &workshopStat{Workshop: group}
				wsMap[group] = ws
			}
			k := rowKey{o.ID, i}
			ws.Pieces += it.Qty
			ws.Good += rowGood[k]
			ws.Scrap += rowScrap[k]
			ws.LaborMinutes += labor * it.Qty
		}
	}
	// 车间覆盖的订单数（同一订单的多行只计一次）
	seen := map[string]map[int64]bool{}
	for _, o := range orders {
		if o.Status != model.StatusInProduction {
			continue
		}
		for _, it := range o.Items {
			group := "未分组"
			if it.Spec != nil && it.Spec.Group != "" {
				group = it.Spec.Group
			}
			if seen[group] == nil {
				seen[group] = map[int64]bool{}
			}
			seen[group][o.ID] = true
		}
	}
	for group, ws := range wsMap {
		ws.Orders = len(seen[group])
		if ws.Pieces > 0 {
			ws.Progress = float64(ws.Good) / float64(ws.Pieces)
		}
		resp.Workshops = append(resp.Workshops, ws)
	}
	sort.Slice(resp.Workshops, func(i, j int) bool {
		return resp.Workshops[i].Workshop < resp.Workshops[j].Workshop
	})

	for _, rep := range reports {
		if rep.At.Before(dayStart) {
			continue
		}
		resp.TodayReports++
		if rep.Action != model.ReportComplete {
			continue
		}
		resp.TodayGood += rep.QtyGood
		resp.TodayScrap += rep.QtyScrap
		// 折算工时：合格件数 × 该工单行的标准工时（主数据缺失时记 0）
		if o := byID[rep.OrderID]; o != nil && rep.ItemIndex >= 0 && rep.ItemIndex < len(o.Items) {
			if s := o.Items[rep.ItemIndex].Spec; s != nil {
				resp.TodayLaborMinutes += rep.QtyGood * s.LaborMinutes
			}
		}
	}

	resp.Recent = reports
	if len(resp.Recent) > 12 {
		resp.Recent = resp.Recent[:12]
	}
	writeJSON(w, http.StatusOK, resp)
}

// dayBegin 本地时区的当日零点（Truncate(24h) 是 UTC 边界，东八区会差 8 小时）
func dayBegin(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
