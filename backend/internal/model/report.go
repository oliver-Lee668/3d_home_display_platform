// 车间报工模型：数字工厂的执行层留痕。
// 工单打印出去只是"纸"，报工记录才把车间执行闭环回系统：
// 工人扫码领活（start）→ 完工报合格/废品数（complete），看板与工单进度都由此汇总。
package model

import "time"

// 报工动作
const (
	// ReportStart 开工：领取某个工单行，开始作业（不报数量）
	ReportStart = "start"
	// ReportComplete 完工：报合格数与废品数
	ReportComplete = "complete"
)

// KnownReportAction 是否为已定义的报工动作
func KnownReportAction(action string) bool {
	return action == ReportStart || action == ReportComplete
}

// WorkReport 一次报工记录。
// ItemName / Workshop 在写入时从订单行冗余落库：看板流水不必再回 join 订单，
// 也保证订单事后被改（理论上不会）时历史报工仍保留当时读数。
type WorkReport struct {
	ID        int64  `json:"id"`
	OrderID   int64  `json:"orderId"`
	OrderNo   string `json:"orderNo"`
	ItemIndex int    `json:"itemIndex"`
	ItemName  string `json:"itemName"`
	Workshop  string `json:"workshop"`
	Action    string `json:"action"`
	QtyGood   int    `json:"qtyGood"`
	QtyScrap  int    `json:"qtyScrap"`
	// Worker 报工人（角色:显示名），与流转历史一样取自 token，不可手填
	Worker string    `json:"worker"`
	Note   string    `json:"note,omitempty"`
	At     time.Time `json:"at"`
}
