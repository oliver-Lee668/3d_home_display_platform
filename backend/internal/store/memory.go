package store

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"showroom-backend/internal/model"
)

// memoryStore 内存实现，仅用于无 MySQL 环境下的演示与验收（重启即失）
type memoryStore struct {
	mu        sync.RWMutex
	seq       int64
	userSeq   int64
	reportSeq int64
	orders    map[int64]*model.Order
	entries   map[string]*model.CatalogEntry
	users     map[string]*model.User
	reports   map[int64]*model.WorkReport
}

// NewMemory 创建内存存储
func NewMemory() Store {
	return &memoryStore{
		orders:  map[int64]*model.Order{},
		entries: map[string]*model.CatalogEntry{},
		users:   map[string]*model.User{},
		reports: map[int64]*model.WorkReport{},
	}
}

func (m *memoryStore) Ping() error { return nil }

func (m *memoryStore) Create(o *model.Order) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seq++
	o.ID = m.seq
	now := time.Now()
	o.CreatedAt = now
	o.UpdatedAt = now
	cp := *o
	m.orders[o.ID] = &cp
	return nil
}

func (m *memoryStore) List(status, phone string) ([]*model.Order, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*model.Order, 0, len(m.orders))
	for _, o := range m.orders {
		if status != "" && o.Status != status {
			continue
		}
		if phone != "" && o.Customer.Phone != phone {
			continue
		}
		cp := *o
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (m *memoryStore) Lookup(orderNo, phone string) ([]*model.Order, error) {
	orderNo = strings.TrimSpace(orderNo)
	phone = strings.TrimSpace(phone)
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []*model.Order{}
	if orderNo == "" || phone == "" {
		return out, nil
	}
	for _, o := range m.orders {
		if o.OrderNo != orderNo || o.Customer.Phone != phone {
			continue
		}
		cp := *o
		out = append(out, &cp)
	}
	return out, nil
}

func (m *memoryStore) Get(id int64) (*model.Order, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	o, ok := m.orders[id]
	if !ok {
		return nil, errors.New("订单不存在")
	}
	cp := *o
	return &cp, nil
}

func (m *memoryStore) Save(o *model.Order) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.orders[o.ID]; !ok {
		return errors.New("订单不存在")
	}
	o.UpdatedAt = time.Now()
	cp := *o
	m.orders[o.ID] = &cp
	return nil
}

func (m *memoryStore) ListEntries() ([]*model.CatalogEntry, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*model.CatalogEntry, 0, len(m.entries))
	for _, e := range m.entries {
		cp := *e
		out = append(out, &cp)
	}
	return out, nil
}

func (m *memoryStore) UpsertEntry(e *model.CatalogEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	if old, ok := m.entries[e.EntryID]; ok {
		e.CreatedAt = old.CreatedAt
	} else {
		e.CreatedAt = now
	}
	e.UpdatedAt = now
	cp := *e
	m.entries[e.EntryID] = &cp
	return nil
}

func (m *memoryStore) DeleteEntry(entryID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.entries, entryID)
	return nil
}

// ---------------- 员工账号 ----------------

func (m *memoryStore) GetUser(username string) (*model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[strings.TrimSpace(username)]
	if !ok {
		return nil, nil
	}
	cp := *u
	return &cp, nil
}

func (m *memoryStore) GetUserByID(id int64) (*model.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, u := range m.users {
		if u.ID == id {
			cp := *u
			return &cp, nil
		}
	}
	return nil, nil
}

func (m *memoryStore) CreateUser(u *model.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.users[u.Username]; ok {
		return errors.New("用户名已存在")
	}
	m.userSeq++
	u.ID = m.userSeq
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	cp := *u
	m.users[u.Username] = &cp
	return nil
}

// UpdateUserPassword 改密；同时清除"必须修改初始密码"标记
func (m *memoryStore) UpdateUserPassword(id int64, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			u.PasswordHash = hash
			u.MustChange = false
			u.UpdatedAt = time.Now()
			return nil
		}
	}
	return errors.New("账号不存在")
}

func (m *memoryStore) CountUsers() (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.users), nil
}

// ---------------- 车间报工 ----------------

func (m *memoryStore) AddReport(r *model.WorkReport) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.reportSeq++
	r.ID = m.reportSeq
	r.At = time.Now()
	cp := *r
	m.reports[r.ID] = &cp
	return nil
}

func (m *memoryStore) ListReports(orderID int64) ([]*model.WorkReport, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*model.WorkReport, 0, 8)
	for _, r := range m.reports {
		if r.OrderID == orderID {
			cp := *r
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out, nil
}

func (m *memoryStore) ListAllReports(limit int) ([]*model.WorkReport, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*model.WorkReport, 0, len(m.reports))
	for _, r := range m.reports {
		cp := *r
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.After(out[j].At) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
