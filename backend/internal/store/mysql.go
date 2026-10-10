package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"

	"showroom-backend/internal/model"
)

const createTableSQL = `CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no      VARCHAR(32)     NOT NULL,
  status        VARCHAR(32)     NOT NULL DEFAULT 'submitted',
  customer_json JSON            NOT NULL,
  room_json     LONGTEXT        NOT NULL,
  items_json    JSON            NOT NULL,
  history_json  JSON            NOT NULL,
  total_amount  DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_status (status),
  KEY idx_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`

const createEntriesTableSQL = `CREATE TABLE IF NOT EXISTS catalog_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id      VARCHAR(64)     NOT NULL,
  type          VARCHAR(24)     NOT NULL,
  payload_json  LONGTEXT,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_entry (entry_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`

// splitDSN 把 "user:pass@tcp(host:port)/dbname?params" 拆成 无库DSN 与 库名
func splitDSN(dsn string) (base, dbname string, ok bool) {
	i := strings.Index(dsn, ")/")
	if i < 0 {
		return "", "", false
	}
	rest := dsn[i+2:]
	j := strings.Index(rest, "?")
	if j < 0 {
		dbname, rest = rest, ""
	} else {
		dbname, rest = rest[:j], rest[j:]
	}
	return dsn[:i+2] + rest, dbname, true
}

// ensureSchema 库不存在则建库，再保证表存在（免手动执行 schema.sql）
func ensureSchema(dsn string) error {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	pingErr := db.Ping()
	db.Close()
	if pingErr != nil {
		base, dbname, ok := splitDSN(dsn)
		if !ok {
			return pingErr
		}
		bdb, e := sql.Open("mysql", base)
		if e != nil {
			return pingErr
		}
		if e = bdb.Ping(); e != nil {
			bdb.Close()
			return pingErr
		}
		if _, e = bdb.Exec("CREATE DATABASE IF NOT EXISTS `" + dbname + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); e != nil {
			bdb.Close()
			return e
		}
		bdb.Close()
	}
	db2, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	defer db2.Close()
	if _, err = db2.Exec(createTableSQL); err != nil {
		return err
	}
	_, err = db2.Exec(createEntriesTableSQL)
	return err
}

// mysqlStore MySQL 实现（生产）
type mysqlStore struct {
	db *sql.DB
}

// NewMySQL 连接 MySQL；启动时自动建库建表
func NewMySQL(dsn string) (Store, error) {
	if err := ensureSchema(dsn); err != nil {
		return nil, err
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return &mysqlStore{db: db}, nil
}

func (s *mysqlStore) Ping() error { return s.db.Ping() }

func (s *mysqlStore) Create(o *model.Order) error {
	cust, err := json.Marshal(o.Customer)
	if err != nil {
		return err
	}
	room, err := json.Marshal(o.Room)
	if err != nil {
		return err
	}
	items, err := json.Marshal(o.Items)
	if err != nil {
		return err
	}
	hist, err := json.Marshal(o.History)
	if err != nil {
		return err
	}
	now := time.Now()
	res, err := s.db.Exec(
		`INSERT INTO orders (order_no, status, customer_json, room_json, items_json, history_json, total_amount, created_at, updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?)`,
		o.OrderNo, o.Status, cust, room, items, hist, o.TotalAmount, now, now,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	o.ID = id
	o.CreatedAt = now
	o.UpdatedAt = now
	return nil
}

func (s *mysqlStore) List(status, phone string) ([]*model.Order, error) {
	q := `SELECT id, order_no, status, customer_json, room_json, items_json, history_json, total_amount, created_at, updated_at
	      FROM orders WHERE 1=1`
	args := []any{}
	if status != "" {
		q += ` AND status = ?`
		args = append(args, status)
	}
	if phone != "" {
		q += ` AND JSON_UNQUOTE(JSON_EXTRACT(customer_json, '$.phone')) = ?`
		args = append(args, phone)
	}
	q += ` ORDER BY created_at DESC, id DESC`
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOrders(rows)
}

func (s *mysqlStore) Get(id int64) (*model.Order, error) {
	rows, err := s.db.Query(
		`SELECT id, order_no, status, customer_json, room_json, items_json, history_json, total_amount, created_at, updated_at
		 FROM orders WHERE id = ?`, id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list, err := scanOrders(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, errors.New("订单不存在")
	}
	return list[0], nil
}

func (s *mysqlStore) Save(o *model.Order) error {
	hist, err := json.Marshal(o.History)
	if err != nil {
		return err
	}
	now := time.Now()
	_, err = s.db.Exec(
		`UPDATE orders SET status = ?, history_json = ?, updated_at = ? WHERE id = ?`,
		o.Status, hist, now, o.ID,
	)
	if err != nil {
		return err
	}
	o.UpdatedAt = now
	return nil
}

func scanOrders(rows *sql.Rows) ([]*model.Order, error) {
	out := []*model.Order{}
	for rows.Next() {
		var o model.Order
		var cust, room, items, hist []byte
		if err := rows.Scan(&o.ID, &o.OrderNo, &o.Status, &cust, &room, &items, &hist, &o.TotalAmount, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(cust, &o.Customer); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(room, &o.Room); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(items, &o.Items); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(hist, &o.History); err != nil {
			return nil, err
		}
		out = append(out, &o)
	}
	return out, rows.Err()
}

func (s *mysqlStore) ListEntries() ([]*model.CatalogEntry, error) {
	rows, err := s.db.Query(
		`SELECT entry_id, type, payload_json, created_at, updated_at FROM catalog_entries ORDER BY id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*model.CatalogEntry{}
	for rows.Next() {
		var e model.CatalogEntry
		var payload []byte
		if err := rows.Scan(&e.EntryID, &e.Type, &payload, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		e.Payload = payload
		out = append(out, &e)
	}
	return out, rows.Err()
}

func (s *mysqlStore) UpsertEntry(e *model.CatalogEntry) error {
	_, err := s.db.Exec(
		`INSERT INTO catalog_entries (entry_id, type, payload_json)
		 VALUES (?,?,?)
		 ON DUPLICATE KEY UPDATE type = VALUES(type), payload_json = VALUES(payload_json)`,
		e.EntryID, string(e.Type), string(e.Payload),
	)
	return err
}

func (s *mysqlStore) DeleteEntry(entryID string) error {
	_, err := s.db.Exec(`DELETE FROM catalog_entries WHERE entry_id = ?`, entryID)
	return err
}
