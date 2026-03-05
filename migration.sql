-- =============================================
-- MIGRATION V1 — POS Kasir
-- Schema database lengkap dari awal
--
-- Cara pakai:
-- 1. Buka phpMyAdmin
-- 2. Klik tab SQL
-- 3. Paste seluruh isi file ini → Klik Go
--
-- Setelah ini jalankan migration_v2.sql
-- =============================================

CREATE DATABASE IF NOT EXISTS pos_kasir
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pos_kasir;

-- =============================================
-- TABEL USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','kasir') NOT NULL DEFAULT 'kasir',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_username (username)
);

-- =============================================
-- TABEL CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS categories (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

INSERT IGNORE INTO categories (id, name) VALUES
  (1, 'Makanan'),
  (2, 'Minuman'),
  (3, 'Snack'),
  (4, 'Lainnya');

-- =============================================
-- TABEL PRODUCTS
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id          INT           NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255)  NOT NULL,
  price       INT           NOT NULL DEFAULT 0,
  stock       INT           NOT NULL DEFAULT 0,
  category_id INT           NOT NULL DEFAULT 4,
  icon        VARCHAR(10)   NOT NULL DEFAULT '📦',
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_active   (is_active),
  INDEX idx_category (category_id)
);

-- =============================================
-- TABEL TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS transactions (
  id              INT         NOT NULL AUTO_INCREMENT,
  invoice_no      VARCHAR(50) NOT NULL UNIQUE,
  user_id         INT         NOT NULL,
  total_amount    INT         NOT NULL DEFAULT 0,
  discount_type   ENUM('none','percent','nominal') NOT NULL DEFAULT 'none',
  discount_amount INT         NOT NULL DEFAULT 0,
  paid_amount     INT         NOT NULL DEFAULT 0,
  change_amount   INT         NOT NULL DEFAULT 0,
  payment_method  VARCHAR(20) NOT NULL DEFAULT 'tunai',
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_created_at (created_at),
  INDEX idx_user_id    (user_id)
);

-- =============================================
-- TABEL TRANSACTION_ITEMS
-- =============================================
CREATE TABLE IF NOT EXISTS transaction_items (
  id             INT NOT NULL AUTO_INCREMENT,
  transaction_id INT NOT NULL,
  product_id     INT NOT NULL,
  quantity       INT NOT NULL DEFAULT 1,
  price          INT NOT NULL DEFAULT 0,
  subtotal       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id)     REFERENCES products(id),
  INDEX idx_transaction_id (transaction_id)
);

SELECT 'Migration V1 berhasil! ✅ Sekarang jalankan migration_v2.sql' AS status;
