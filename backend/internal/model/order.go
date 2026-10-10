// 订单领域模型与状态机
package model

import (
	"errors"
	"time"
)

// 订单状态
const (
	StatusSubmitted       = "submitted"        // 已下单，待销售确认
	StatusSalesConfirmed  = "sales_confirmed"  // 销售已确认，待生产确认
	StatusInProduction    = "in_production"    // 生产已确认，进入生产
	StatusCompleted       = "completed"        // 生产完成
)

// StatusLabel 中文状态名（供前端展示）
var StatusLabel = map[string]string{
	StatusSubmitted:      "已下单·待销售确认",
	StatusSalesConfirmed: "销售已确认·待生产确认",
	StatusInProduction:   "生产中",
	StatusCompleted:      "已完成",
}

// 流转动作 -> 允许的 源状态:目标状态
var transitions = map[string]map[string]string{
	"sales_confirm":      {StatusSubmitted: StatusSalesConfirmed},
	"production_confirm": {StatusSalesConfirmed: StatusInProduction},
	"complete":           {StatusInProduction: StatusCompleted},
}

// ActionLabel 动作中文名
var ActionLabel = map[string]string{
	"sales_confirm":      "销售确认",
	"production_confirm": "生产确认",
	"complete":           "完成生产",
}

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

// OrderItem 订单中的一件商品
type OrderItem struct {
	ProductID     string  `json:"productId"`
	Name          string  `json:"name"`
	Qty           int     `json:"qty"`
	MaterialID    string  `json:"materialId"`
	MaterialLabel string  `json:"materialLabel"`
	Scale         float64 `json:"scale"`
	UnitPrice     float64 `json:"unitPrice"`
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
