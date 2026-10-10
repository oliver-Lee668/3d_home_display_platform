package store

import (
	"errors"
	"sort"
	"sync"
	"time"

	"showroom-backend/internal/model"
)

// memoryStore 内存实现，仅用于无 MySQL 环境下的演示与验收（重启即失）
type memoryStore struct {
	mu     sync.RWMutex
	seq    int64
	orders map[int64]*model.Order
}

// NewMemory 创建内存存储
func NewMemory() Store {
	return &memoryStore{orders: map[int64]*model.Order{}}
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
