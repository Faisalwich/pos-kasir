-- =============================================
-- MIGRATION V2 — POS Kasir
-- Jalankan di phpMyAdmin:
--   database pos_kasir → tab SQL → paste → Go
--
-- Aman dijalankan berulang (IF NOT EXISTS +
-- INSERT IGNORE tidak menimpa data yang sudah ada)
-- =============================================

USE pos_kasir;

-- =============================================
-- TABEL SHIFTS
-- Riwayat buka/tutup shift kasir
-- =============================================
CREATE TABLE IF NOT EXISTS shifts (
  id                  INT         NOT NULL AUTO_INCREMENT,
  user_id             INT         NOT NULL,
  opened_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           DATETIME    NULL,
  opening_cash        INT         NOT NULL DEFAULT 0,
  closing_cash        INT         NULL,
  total_transactions  INT         NOT NULL DEFAULT 0,
  total_tunai         INT         NOT NULL DEFAULT 0,
  total_non_tunai     INT         NOT NULL DEFAULT 0,
  status              ENUM('open','closed') NOT NULL DEFAULT 'open',
  notes               TEXT        NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_user_status (user_id, status),
  INDEX idx_opened_at   (opened_at)
);

-- =============================================
-- TABEL SETTINGS
-- Konfigurasi toko sebagai key-value
-- Diubah dari Admin → Pengaturan Toko
-- =============================================
CREATE TABLE IF NOT EXISTS settings (
  `key`       VARCHAR(100)  NOT NULL,
  value       TEXT          NOT NULL DEFAULT '',
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
);

-- =============================================
-- DATA DEFAULT SETTINGS
-- INSERT IGNORE = skip jika key sudah ada
-- =============================================
INSERT IGNORE INTO settings (`key`, value) VALUES
  ('store_name',          'Toko Sumber Makmur'),
  ('store_address',       'Jl. Contoh No. 1, Kota'),
  ('store_phone',         '08123456789'),
  ('store_tagline',       'Terima kasih telah berbelanja!'),
  ('receipt_footer',      'Barang yang sudah dibeli tidak dapat dikembalikan'),
  ('bank1_name',          'BCA'),
  ('bank1_no',            '1234567890'),
  ('bank1_owner',         'Nama Pemilik'),
  ('bank2_name',          'Mandiri'),
  ('bank2_no',            '0987654321'),
  ('bank2_owner',         'Nama Pemilik'),
  ('low_stock_threshold', '5');

-- Verifikasi
SELECT 'Migration V2 berhasil! ✅' AS status;
SELECT `key`, value FROM settings ORDER BY `key`;
