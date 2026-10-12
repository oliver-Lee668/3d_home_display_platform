-- 订单库表结构（MySQL 8+）
-- 用法：mysql -u root -p < schema.sql
-- 说明：后端启动时 ensureSchema 会自动建库建表，本文件仅供 DBA 审阅与手工初始化。
CREATE DATABASE IF NOT EXISTS furniture_showroom DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE furniture_showroom;

CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no      VARCHAR(32)     NOT NULL,
  status        VARCHAR(32)     NOT NULL DEFAULT 'submitted',
  customer_json JSON            NOT NULL,
  room_json     LONGTEXT        NOT NULL,           -- 含 3D 截图 dataURL，体积大用 LONGTEXT
  items_json    JSON            NOT NULL,
  history_json  JSON            NOT NULL,
  total_amount  DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_status (status),
  KEY idx_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 目录条目：销售端对内置商品/地板的覆盖、新增与下架，payload_json 里含完整规格基线
CREATE TABLE IF NOT EXISTS catalog_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id      VARCHAR(64)     NOT NULL,
  type          VARCHAR(24)     NOT NULL,
  payload_json  LONGTEXT,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_entry (entry_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 员工账号（销售/生产/管理员）。客户端不注册、不入本表，查单靠订单号+手机号双因子。
-- password_hash 格式：pbkdf2$<迭代次数>$<盐 b64>$<散列 b64>，绝不存明文。
-- must_change=1 表示仍在用初始密码，此时后端只放行 /api/me 与 /api/change-password。
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)     NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          VARCHAR(16)     NOT NULL,           -- sales / production / admin
  display_name  VARCHAR(64)     NOT NULL,
  active        TINYINT(1)      NOT NULL DEFAULT 1,
  must_change   TINYINT(1)      NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
