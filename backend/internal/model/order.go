// 订单领域模型与状态机
package model

import (
	"errors"
	"time"
)

// 订单状态
const (
	StatusSubmitted      = "submitted"       // 已下单，待销售确认
	StatusSalesConfirmed = "sales_confirmed" // 销售已确认，待生产确认
	StatusInProduction   = "in_production"   // 生产已确认，进入生产
	StatusCompleted      = "completed"       // 生产完成
	StatusRejected       = "rejected"        // 生产退回（规格/工艺不可行），待销售处理
)

// StatusLabel 中文状态名（供前端展示）
var StatusLabel = map[string]string{
	StatusSubmitted:      "已下单·待销售确认",
	StatusSalesConfirmed: "销售已确认·待生产确认",
	StatusInProduction:   "生产中",
	StatusCompleted:      "已完成",
	StatusRejected:       "已退回·待销售处理",
}

// 流转动作 -> 允许的 源状态:目标状态
var transitions = map[string]map[string]string{
	"sales_confirm":      {StatusSubmitted: StatusSalesConfirmed},
	"production_confirm": {StatusSalesConfirmed: StatusInProduction},
	"complete":           {StatusInProduction: StatusCompleted},
	// 生产退回：尺寸/工艺不可行时退回销售，需附原因
	"reject": {StatusSalesConfirmed: StatusRejected, StatusInProduction: StatusRejected},
	// 销售与客户重新确认后再次提交生产
	"resubmit": {StatusRejected: StatusSalesConfirmed},
}

// ActionLabel 动作中文名
var ActionLabel = map[string]string{
	"sales_confirm":      "销售确认",
	"production_confirm": "生产确认",
	"complete":           "完成生产",
	"reject":             "生产退回",
	"resubmit":           "销售重新提交",
}

// NeedsNote 该动作必须填写备注（退回原因）
func NeedsNote(action string) bool { return action == "reject" }

// NextStatus 根据当前状态与动作计算目标状态；不合法返回 error
func NextStatus(cur, action string) (string, error) {
	m, ok := transitions[action]
	if !ok {
		return "", errors.New("未知动作: " + action)
	}
	to, ok := m[cur]
	if !ok {
		return "", errors.New("当前状态不允许该动作: " + cur + " / " + action)
	}
	return to, nil
}

// Drawing 图纸附件（销售端上传，生产端下载）
type Drawing struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// ItemSpec 下单瞬间冻结的生产规格快照。
// 必须快照而不能让生产端反查当前目录：销售事后可随时替换模型/改规格，
// 已下单订单的加工依据必须保持不变。
type ItemSpec struct {
	SKU      string `json:"sku,omitempty"`
	Category string `json:"category,omitempty"` // 商品分类（拆单分组用）
	Group    string `json:"group,omitempty"`    // 车间分组：家具/家电/软装

	// 标准外形尺寸（米）与定制后实际尺寸（毫米）
	BaseSizeW float64 `json:"baseSizeW"`
	BaseSizeH float64 `json:"baseSizeH"`
	BaseSizeD float64 `json:"baseSizeD"`
	SizeWMM   int     `json:"sizeWmm"`
	SizeHMM   int     `json:"sizeHmm"`
	SizeDMM   int     `json:"sizeDmm"`

	MaterialSku  string  `json:"materialSku,omitempty"`
	ColorCode    string  `json:"colorCode,omitempty"`
	Craft        string  `json:"craft,omitempty"`        // 工艺路线/加工要求
	Packing      string  `json:"packing,omitempty"`      // 包装规格
	LaborMinutes int     `json:"laborMinutes,omitempty"` // 单件标准工时（分钟）
	ScaleMin     float64 `json:"scaleMin,omitempty"`     // 可行域：最小缩放
	ScaleMax     float64 `json:"scaleMax,omitempty"`     // 可行域：最大缩放

	Drawings []Drawing `json:"drawings,omitempty"`
	// 带尺寸标注的三视图（正/侧/俯合成图）dataURL
	Views string `json:"views,omitempty"`
}

// OrderItem 订单中的一件商品
type OrderItem struct {
	ProductID     string    `json:"productId"`
	Name          string    `json:"name"`
	Qty           int       `json:"qty"`
	MaterialID    string    `json:"materialId"`
	MaterialLabel string    `json:"materialLabel"`
	Scale         float64   `json:"scale"`
	UnitPrice     float64   `json:"unitPrice"`
	Spec          *ItemSpec `json:"spec,omitempty"`
}

// Customer 下单客户信息
type Customer struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Note  string `json:"note,omitempty"`
}

// RoomSnapshot 定制空间快照（尺寸/地板/3D 截图）
type RoomSnapshot struct {
	RoomID     string  `json:"roomId"`
	RoomName   string  `json:"roomName"`
	SizeW      float64 `json:"sizeW"`
	SizeD      float64 `json:"sizeD"`
	SizeH      float64 `json:"sizeH"`
	FloorLabel string  `json:"floorLabel"`
	// 3D 场景截图 dataURL（可能较大）
	Snapshot string `json:"snapshot,omitempty"`
}

// HistoryEntry 一次状态流转记录
type HistoryEntry struct {
	Status string    `json:"status"`
	By     string    `json:"by"`
	At     time.Time `json:"at"`
	Note   string    `json:"note,omitempty"`
}

// Order 定制订单
type Order struct {
	ID          int64          `json:"id"`
	OrderNo     string         `json:"orderNo"`
	Status      string         `json:"status"`
	Customer    Customer       `json:"customer"`
	Room        RoomSnapshot   `json:"room"`
	Items       []OrderItem    `json:"items"`
	TotalAmount float64        `json:"totalAmount"`
	History     []HistoryEntry `json:"history"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}
