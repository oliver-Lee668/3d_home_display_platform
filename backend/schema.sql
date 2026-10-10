-- 订单库表结构（MySQL 8+）
-- 用法：mysql -u root -p < schema.sql
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
