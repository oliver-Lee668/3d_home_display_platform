// 订单存储抽象：MySQL 实现（生产）与内存实现（演示/验收）
package store

import "showroom-backend/internal/model"

// Store 订单持久化接口
type Store interface {
	// Ping 探测存储可用性
	Ping() error
	// Create 新建订单（实现负责分配 ID）
	Create(o *model.Order) error
	// List 按状态/客户手机号过滤，按创建时间倒序
	List(status, phone string) ([]*model.Order, error)
	// Get 按 ID 读取
	Get(id int64) (*model.Order, error)
	// Save 整体回写（状态流转后）
	Save(o *model.Order) error
}
