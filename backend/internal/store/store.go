// 订单存储抽象：MySQL 实现（生产）与内存实现（演示/验收）
package store

import "showroom-backend/internal/model"

// Store 订单持久化接口
type Store interface {
	// Ping 探测存储可用性
	Ping() error
	// Create 新建订单（实现负责分配 ID）
	Create(o *model.Order) error
	// List 按状态/客户手机号过滤，按创建时间倒序（需员工登录）
	List(status, phone string) ([]*model.Order, error)
	// Lookup 客户端自助查单：订单号 + 手机号双因子，两者必须同时命中
	Lookup(orderNo, phone string) ([]*model.Order, error)
	// Get 按 ID 读取
	Get(id int64) (*model.Order, error)
	// Save 整体回写（状态流转后）
	Save(o *model.Order) error

	// ListEntries 读取全部目录条目
	ListEntries() ([]*model.CatalogEntry, error)
	// UpsertEntry 新建或覆盖目录条目
	UpsertEntry(e *model.CatalogEntry) error
	// DeleteEntry 删除目录条目
	DeleteEntry(entryID string) error

	// GetUser 按用户名读取（含 PasswordHash，仅限登录校验使用）
	GetUser(username string) (*model.User, error)
	// GetUserByID 按 ID 读取（逐请求复核账号是否仍有效）
	GetUserByID(id int64) (*model.User, error)
	// CreateUser 新建账号
	CreateUser(u *model.User) error
	// UpdateUserPassword 改密
	UpdateUserPassword(id int64, hash string) error
	// CountUsers 账号总数（首次启动播种默认账号用）
	CountUsers() (int, error)

	// AddReport 写入一条车间报工记录（实现负责分配 ID 与时间）
	AddReport(r *model.WorkReport) error
	// ListReports 按订单读取报工流水（时间正序）
	ListReports(orderID int64) ([]*model.WorkReport, error)
	// ListAllReports 全部报工流水（时间倒序）；limit <= 0 表示不限
	ListAllReports(limit int) ([]*model.WorkReport, error)
}
