// =============================================
// SERVER UTAMA — POS KASIR
// Express + MySQL2 + JWT + Bcrypt
// + Helmet + Rate Limiting + Winston Logger
// =============================================
require('dotenv').config();

// =============================================
// VALIDASI ENVIRONMENT VARIABLES
// Server tidak mau jalan kalau .env tidak lengkap
// DB_PASSWORD boleh kosong (XAMPP default)
// =============================================
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missingEnv   = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ ENV tidak lengkap! Variabel berikut belum diisi di .env:`);
  missingEnv.forEach(k => console.error(`   - ${k}`));
  console.error(`📋 Salin .env.example ke .env lalu isi semua nilainya.`);
  process.exit(1);
}

const express       = require('express');
const cors          = require('cors');
const bcrypt        = require('bcryptjs');
const jwt           = require('jsonwebtoken');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const db            = require('./db');
const logger        = require('./logger');

const app  = express();
const PORT = process.env.PORT || 3000;

// Kunci rahasia JWT — wajib diisi di .env
const JWT_SECRET = process.env.JWT_SECRET;

// =============================================
// MIDDLEWARE: HELMET
// Set security headers HTTP secara otomatis.
// Mencegah: clickjacking, MIME sniffing,
// XSS via header, dan info bocor tentang server
// =============================================
app.use(helmet({
  // Izinkan load font Google di halaman HTML
  contentSecurityPolicy: false,
  // Izinkan iframe untuk cetak struk (window.print)
  frameguard: false,
}));

// =============================================
// MIDDLEWARE: RATE LIMITER — GLOBAL
// Batasi semua request: max 200 per 15 menit per IP
// Mencegah DDoS ringan dan scraping
// =============================================
const globalLimiter = rateLimit({
  windowMs : 15 * 60 * 1000, // 15 menit
  max      : 200,             // max request per window
  message  : { error: 'Terlalu banyak request. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders  : false,
});
app.use(globalLimiter);

// =============================================
// MIDDLEWARE: RATE LIMITER — LOGIN
// Lebih ketat khusus endpoint login
// Max 10 percobaan per 15 menit per IP
// Mencegah brute force password
// =============================================
const loginLimiter = rateLimit({
  windowMs : 15 * 60 * 1000, // 15 menit
  max      : 10,              // max 10 percobaan login
  message  : { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders  : false,
  // Log setiap kali rate limit kena — berguna untuk deteksi serangan
  handler: (req, res, next, options) => {
    logger.warn('Rate limit login kena', {
      ip     : req.ip,
      path   : req.path,
      method : req.method,
    });
    res.status(options.statusCode).json(options.message);
  },
});

// =============================================
// MIDDLEWARE: REQUEST LOGGER
// Catat setiap request masuk ke log file
// Format: METHOD /path — IP — durasi ms
// =============================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level    = res.statusCode >= 500 ? 'error'
                   : res.statusCode >= 400 ? 'warn'
                   : 'info';
    logger[level](`${req.method} ${req.path} ${res.statusCode} — ${req.ip} — ${duration}ms`);
  });
  next();
});

// =============================================
// MIDDLEWARE GLOBAL
// =============================================
app.use(cors());
app.use(express.json());

// =============================================
// STATIC FILES
// Serve file HTML, CSS, JS dari folder root project
// Sehingga bisa diakses via http://localhost:3000/kasir.html
// =============================================
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// =============================================
// MIDDLEWARE: VERIFIKASI JWT TOKEN
// Dipasang di setiap route yang butuh login
// =============================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1]; // Ambil setelah "Bearer "

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ada, silakan login' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Payload: { id, username, role, name }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token tidak valid atau sudah expired' });
  }
}

// =============================================
// MIDDLEWARE: HANYA ADMIN
// Selalu dipasang SETELAH authMiddleware
// =============================================
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak — hanya untuk admin' });
  }
  next();
}

// =============================================
// ROUTE TEST
// GET /
// =============================================
app.get('/', (req, res) => {
  res.json({ message: '✅ Server POS berjalan!' });
});


// ==============================================
// ===== AUTH ===================================
// ==============================================

// =============================================
// SETUP PASSWORD — jalankan SEKALI setelah install
// POST /api/auth/setup
// Akan hash password default untuk akun seed
// =============================================
app.post('/api/auth/setup', async (req, res) => {
  try {
    const hashAdmin = await bcrypt.hash('admin123', 10);
    const hashKasir = await bcrypt.hash('kasir123', 10);

    await db.query(`UPDATE users SET password = ? WHERE username = 'admin'`,  [hashAdmin]);
    await db.query(`UPDATE users SET password = ? WHERE username = 'kasir1'`, [hashKasir]);

    res.json({
      message : '✅ Password berhasil di-setup!',
      akun    : [
        { username: 'admin',  password: 'admin123', role: 'admin' },
        { username: 'kasir1', password: 'kasir123', role: 'kasir' },
      ]
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal setup password' });
  }
});

// =============================================
// LOGIN
// POST /api/auth/login
// Body: { username, password }
// Response: { token, user }
// =============================================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM users WHERE username = ?`,
      [username]
    );

    // Jangan bedain pesan error username vs password — security best practice
    if (rows.length === 0) {
      logger.warn(`Login gagal — username tidak ditemukan: ${username}`, { ip: req.ip });
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const user = rows[0];

    // Bandingkan password plaintext dengan hash di DB
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logger.warn(`Login gagal — password salah untuk: ${username}`, { ip: req.ip });
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    // Buat token JWT — berlaku 8 jam (satu shift kerja)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    logger.info(`Login berhasil: ${username} (${user.role})`, { ip: req.ip });

    res.json({
      message : '✅ Login berhasil',
      token,
      user    : { id: user.id, name: user.name, role: user.role }
    });

  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// =============================================
// CEK TOKEN — validasi sesi saat halaman dibuka ulang
// GET /api/auth/me
// =============================================
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});


// ==============================================
// ===== PRODUCTS ===============================
// ==============================================

// GET produk aktif — untuk halaman kasir
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.price, p.stock, p.icon, p.is_active,
             c.name AS category, p.category_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
      ORDER BY c.name, p.name
    `);
    res.json(rows);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
});

// GET semua produk termasuk nonaktif — untuk admin
app.get('/api/admin/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.price, p.stock, p.icon, p.is_active,
             c.name AS category, p.category_id, p.created_at
      FROM products p
      JOIN categories c ON p.category_id = c.id
      ORDER BY p.id DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
});

// TAMBAH produk — hanya admin
app.post('/api/products', authMiddleware, adminOnly, async (req, res) => {
  const { name, price, stock, icon, category_id } = req.body;
  if (!name || !price || !category_id) {
    return res.status(400).json({ error: 'name, price, dan category_id wajib diisi' });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO products (name, price, stock, icon, category_id) VALUES (?, ?, ?, ?, ?)`,
      [name, price, stock || 0, icon || '📦', category_id]
    );
    res.status(201).json({ message: '✅ Produk berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal menambahkan produk' });
  }
});

// UPDATE produk — hanya admin
app.put('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, price, stock, icon, category_id, is_active } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE products SET name=?, price=?, stock=?, icon=?, category_id=?, is_active=? WHERE id=?`,
      [name, price, stock, icon, category_id, is_active ?? 1, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json({ message: '✅ Produk berhasil diupdate' });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal mengupdate produk' });
  }
});

// HAPUS produk (soft delete) — hanya admin
app.delete('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE products SET is_active = 0 WHERE id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json({ message: '✅ Produk berhasil dinonaktifkan' });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal menghapus produk' });
  }
});


// ==============================================
// ===== CATEGORIES =============================
// ==============================================

app.get('/api/categories', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM categories ORDER BY name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil kategori' });
  }
});

app.post('/api/categories', authMiddleware, adminOnly, async (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  try {
    const [result] = await db.query(
      `INSERT INTO categories (name, icon) VALUES (?, ?)`,
      [name, icon || '📦']
    );
    res.status(201).json({ message: '✅ Kategori ditambahkan', id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambahkan kategori' });
  }
});


// ==============================================
// ===== TRANSACTIONS ===========================
// ==============================================

// POST transaksi baru — kasir & admin bisa
app.post('/api/transactions', authMiddleware, async (req, res) => {
  const { items, paid_amount } = req.body;

  // user_id dari token — lebih aman daripada dari body request
  const user_id       = req.user.id;
  const total_amount  = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const change_amount = paid_amount - total_amount;

  const now        = new Date();
  const dateStr    = now.toISOString().slice(0, 10).replace(/-/g, '');
  const invoice_no = `INV-${dateStr}-${Date.now().toString().slice(-4)}`;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [txn] = await conn.query(
      `INSERT INTO transactions (user_id, invoice_no, total_amount, paid_amount, change_amount)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, invoice_no, total_amount, paid_amount, change_amount]
    );
    const transaction_id = txn.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [transaction_id, item.product_id, item.product_name, item.price, item.quantity]
      );
      await conn.query(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    await conn.commit();
    res.json({ message: '✅ Transaksi berhasil', invoice_no, total_amount, change_amount, transaction_id });

  } catch (err) {
    await conn.rollback();
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Transaksi gagal' });
  } finally {
    conn.release();
  }
});

// GET histori transaksi — admin only
app.get('/api/transactions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.id, t.invoice_no, t.total_amount, t.paid_amount,
             t.change_amount, t.created_at, u.name AS kasir
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil histori' });
  }
});

// GET detail item per transaksi
app.get('/api/transactions/:id/items', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM transaction_items WHERE transaction_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil detail transaksi' });
  }
});

// GET laporan harian — admin only
app.get('/api/reports/daily', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DATE(created_at) AS tanggal,
             COUNT(*) AS jumlah_transaksi,
             SUM(total_amount) AS total_pendapatan
      FROM transactions
      GROUP BY DATE(created_at)
      ORDER BY tanggal DESC LIMIT 30
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil laporan' });
  }
});

// GET produk terlaris — admin only
app.get('/api/reports/top-products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ti.product_name,
             SUM(ti.quantity) AS total_terjual,
             SUM(ti.quantity * ti.price) AS total_pendapatan
      FROM transaction_items ti
      GROUP BY ti.product_name
      ORDER BY total_terjual DESC LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil laporan produk' });
  }
});

// ==============================================
// ===== USER MANAGEMENT ========================
// ==============================================

// GET semua user — admin only
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Jangan tampilkan kolom password
    const [rows] = await db.query(
      `SELECT id, name, username, role, created_at FROM users ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data user' });
  }
});

// TAMBAH user baru — admin only
// POST /api/users
// Body: { name, username, password, role }
app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }

  try {
    // Cek apakah username sudah dipakai
    const [existing] = await db.query(
      `SELECT id FROM users WHERE username = ?`, [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    // Hash password sebelum disimpan ke DB
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)`,
      [name, username, hashedPassword, role]
    );
    res.status(201).json({ message: '✅ User berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal menambahkan user' });
  }
});

// UPDATE info user (nama, username, role) — admin only
// PUT /api/users/:id
app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, username, role } = req.body;

  try {
    // Cek username tidak bentrok dengan user lain
    const [existing] = await db.query(
      `SELECT id FROM users WHERE username = ? AND id != ?`,
      [username, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    const [result] = await db.query(
      `UPDATE users SET name = ?, username = ?, role = ? WHERE id = ?`,
      [name, username, role, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ message: '✅ User berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengupdate user' });
  }
});

// GANTI PASSWORD — admin bisa ganti password siapapun
// PUT /api/users/:id/password
// Body: { new_password }
app.put('/api/users/:id/password', authMiddleware, adminOnly, async (req, res) => {
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  try {
    const hashed = await bcrypt.hash(new_password, 10);
    const [result] = await db.query(
      `UPDATE users SET password = ? WHERE id = ?`,
      [hashed, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ message: '✅ Password berhasil diganti' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengganti password' });
  }
});

// GANTI PASSWORD SENDIRI — user bisa ganti password sendiri
// PUT /api/auth/change-password
// Body: { old_password, new_password }
app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;

  if (!old_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password lama & baru wajib diisi (min 6 karakter)' });
  }

  try {
    const [rows] = await db.query(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Verifikasi password lama dulu
    const match = await bcrypt.compare(old_password, rows[0].password);
    if (!match) return res.status(401).json({ error: 'Password lama salah' });

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.user.id]);
    res.json({ message: '✅ Password berhasil diganti' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengganti password' });
  }
});

// HAPUS user — admin only, tidak bisa hapus diri sendiri
// DELETE /api/users/:id
app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  // Cegah admin hapus akun sendiri
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  }
  try {
    const [result] = await db.query(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ message: '✅ User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus user' });
  }
});


// ==============================================
// ===== TRANSACTIONS (UPDATED WITH DISCOUNT) ===
// ==============================================

// POST transaksi baru dengan dukungan diskon
// POST /api/transactions/v2
// Body: { items, paid_amount, discount_type, discount_value }
// discount_type: 'none' | 'percent' | 'nominal'
// discount_value: angka (persen atau rupiah)
app.post('/api/transactions/v2', authMiddleware, async (req, res) => {
  const { items, paid_amount, discount_type = 'none', discount_value = 0 } = req.body;

  const user_id      = req.user.id;
  const subtotal     = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // Hitung nilai diskon
  let discount_amount = 0;
  if (discount_type === 'percent') {
    // Diskon persen: pastikan tidak melebihi 100%
    discount_amount = Math.round(subtotal * Math.min(discount_value, 100) / 100);
  } else if (discount_type === 'nominal') {
    // Diskon nominal: pastikan tidak melebihi subtotal
    discount_amount = Math.min(discount_value, subtotal);
  }

  const total_amount  = subtotal - discount_amount;
  const change_amount = paid_amount - total_amount;

  if (change_amount < 0) {
    return res.status(400).json({ error: 'Nominal bayar kurang dari total' });
  }

  const now        = new Date();
  const dateStr    = now.toISOString().slice(0, 10).replace(/-/g, '');
  const invoice_no = `INV-${dateStr}-${Date.now().toString().slice(-4)}`;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Simpan transaksi — tambahkan kolom discount
    // CATATAN: jalankan SQL ALTER di bawah jika tabel belum punya kolom ini
    const [txn] = await conn.query(
      `INSERT INTO transactions
         (user_id, invoice_no, total_amount, paid_amount, change_amount, discount_type, discount_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, invoice_no, total_amount, paid_amount, change_amount, discount_type, discount_amount]
    );
    const transaction_id = txn.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [transaction_id, item.product_id, item.product_name, item.price, item.quantity]
      );
      await conn.query(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    await conn.commit();
    res.json({
      message: '✅ Transaksi berhasil',
      invoice_no, subtotal, discount_amount, total_amount, change_amount, transaction_id
    });

  } catch (err) {
    await conn.rollback();
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Transaksi gagal' });
  } finally {
    conn.release();
  }
});

// ==============================================
// ===== SHIFTS (SHIFT KASIR) ===================
// ==============================================

// =============================================
// CEK SHIFT AKTIF
// GET /api/shifts/active
// =============================================
app.get('/api/shifts/active', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, u.name AS kasir_name
       FROM shifts s JOIN users u ON s.user_id = u.id
       WHERE s.user_id = ? AND s.status = 'open'
       ORDER BY s.opened_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(rows.length > 0 ? rows[0] : null);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal cek shift aktif' });
  }
});

// =============================================
// BUKA SHIFT BARU
// POST /api/shifts/open
// Body: { opening_cash }
// =============================================
app.post('/api/shifts/open', authMiddleware, async (req, res) => {
  const { opening_cash = 0 } = req.body;
  try {
    const [existing] = await db.query(
      `SELECT id FROM shifts WHERE user_id = ? AND status = 'open'`,
      [req.user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Kamu masih punya shift yang belum ditutup' });
    }
    const [result] = await db.query(
      `INSERT INTO shifts (user_id, opening_cash, status) VALUES (?, ?, 'open')`,
      [req.user.id, opening_cash]
    );
    res.json({ message: '✅ Shift dibuka', shift_id: result.insertId, opened_at: new Date() });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal buka shift' });
  }
});

// =============================================
// TUTUP SHIFT
// POST /api/shifts/close
// Body: { shift_id, closing_cash, notes }
// =============================================
app.post('/api/shifts/close', authMiddleware, async (req, res) => {
  const { shift_id, closing_cash = 0, notes = '' } = req.body;
  try {
    const [shifts] = await db.query(
      `SELECT * FROM shifts WHERE id = ? AND user_id = ? AND status = 'open'`,
      [shift_id, req.user.id]
    );
    if (shifts.length === 0) {
      return res.status(404).json({ error: 'Shift tidak ditemukan atau sudah ditutup' });
    }
    const shift = shifts[0];

    // Hitung rekap transaksi selama shift
    const [rekap] = await db.query(
      `SELECT COUNT(*) AS total_transactions, COALESCE(SUM(total_amount),0) AS total_penjualan
       FROM transactions WHERE user_id = ? AND created_at >= ?`,
      [req.user.id, shift.opened_at]
    );
    const totalTrx  = rekap[0].total_transactions;
    const totalJual = rekap[0].total_penjualan;

    await db.query(
      `UPDATE shifts SET status='closed', closed_at=NOW(), closing_cash=?,
       total_transactions=?, total_tunai=?, notes=? WHERE id=?`,
      [closing_cash, totalTrx, totalJual, notes, shift_id]
    );
    res.json({
      message: '✅ Shift ditutup',
      total_transactions: totalTrx,
      total_penjualan: totalJual,
      closing_cash,
      selisih: closing_cash - (shift.opening_cash + Number(totalJual))
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal tutup shift' });
  }
});

// =============================================
// REKAP SHIFT AKTIF — transaksi selama shift
// GET /api/shifts/active/summary
// =============================================
app.get('/api/shifts/active/summary', authMiddleware, async (req, res) => {
  try {
    const [shifts] = await db.query(
      `SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (shifts.length === 0) return res.json({ shift: null, transactions: [], summary: null });

    const shift = shifts[0];
    const [transactions] = await db.query(
      `SELECT t.id, t.invoice_no, t.total_amount, t.paid_amount, t.change_amount, t.created_at
       FROM transactions t
       WHERE t.user_id = ? AND t.created_at >= ?
       ORDER BY t.created_at DESC`,
      [req.user.id, shift.opened_at]
    );
    const totalJual = transactions.reduce((s, t) => s + Number(t.total_amount), 0);
    res.json({
      shift,
      transactions,
      summary: {
        total_transactions: transactions.length,
        total_penjualan: totalJual,
        uang_di_laci: shift.opening_cash + totalJual
      }
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil rekap shift' });
  }
});

// =============================================
// SEMUA SHIFT — untuk admin
// GET /api/shifts
// =============================================
app.get('/api/shifts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, u.name AS kasir_name
       FROM shifts s JOIN users u ON s.user_id = u.id
       ORDER BY s.opened_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil data shift' });
  }
});

// ==============================================
// ===== STOK — LOW STOCK & RESTOCK ============
// ==============================================

// =============================================
// PRODUK STOK MENIPIS
// GET /api/products/low-stock?threshold=5
// =============================================
app.get('/api/products/low-stock', authMiddleware, async (req, res) => {
  const threshold = parseInt(req.query.threshold) || 5;
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.stock, p.icon, c.name AS category
       FROM products p JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND p.stock <= ?
       ORDER BY p.stock ASC`,
      [threshold]
    );
    res.json(rows);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil data stok' });
  }
});

// =============================================
// RESTOCK PRODUK — admin only
// POST /api/products/:id/restock
// Body: { qty_tambah }
// =============================================
app.post('/api/products/:id/restock', authMiddleware, adminOnly, async (req, res) => {
  const { qty_tambah } = req.body;
  if (!qty_tambah || qty_tambah <= 0) {
    return res.status(400).json({ error: 'Jumlah restock harus lebih dari 0' });
  }
  try {
    const [products] = await db.query(
      `SELECT id, name, stock FROM products WHERE id = ?`, [req.params.id]
    );
    if (products.length === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    const stokLama = products[0].stock;
    await db.query(`UPDATE products SET stock = stock + ? WHERE id = ?`, [qty_tambah, req.params.id]);
    res.json({
      message: `✅ Stok berhasil ditambah`,
      stok_lama: stokLama,
      ditambah: qty_tambah,
      stok_baru: stokLama + qty_tambah
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal restock produk' });
  }
});

// ==============================================
// ===== RIWAYAT TRANSAKSI — SEARCH & FILTER ===
// ==============================================

// =============================================
// SEARCH TRANSAKSI
// GET /api/transactions/search?q=&from=&to=&user_id=&limit=
// =============================================
app.get('/api/transactions/search', authMiddleware, adminOnly, async (req, res) => {
  const { q = '', from, to, user_id, limit = 100 } = req.query;
  let conditions = ['1=1'];
  let params     = [];

  if (q)       { conditions.push(`(t.invoice_no LIKE ? OR u.name LIKE ?)`); params.push(`%${q}%`, `%${q}%`); }
  if (from)    { conditions.push(`DATE(t.created_at) >= ?`); params.push(from); }
  if (to)      { conditions.push(`DATE(t.created_at) <= ?`); params.push(to);   }
  if (user_id) { conditions.push(`t.user_id = ?`);           params.push(user_id); }
  params.push(parseInt(limit));

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.invoice_no, t.total_amount, t.paid_amount, t.change_amount,
              t.discount_type, t.discount_amount, t.created_at, u.name AS kasir
       FROM transactions t JOIN users u ON t.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC LIMIT ?`,
      params
    );
    const total_penjualan = rows.reduce((s, r) => s + Number(r.total_amount), 0);
    res.json({ data: rows, count: rows.length, total_penjualan });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal mencari transaksi' });
  }
});

// ==============================================
// ===== LAPORAN DETAIL =========================
// ==============================================

// =============================================
// LAPORAN PER KASIR
// GET /api/reports/by-kasir?from=&to=
// Rekap penjualan digroup per kasir
// =============================================
app.get('/api/reports/by-kasir', authMiddleware, adminOnly, async (req, res) => {
  const { from, to } = req.query;

  let conditions = ['1=1'];
  let params     = [];

  if (from) { conditions.push(`DATE(t.created_at) >= ?`); params.push(from); }
  if (to)   { conditions.push(`DATE(t.created_at) <= ?`); params.push(to);   }

  try {
    const [rows] = await db.query(`
      SELECT
        u.id,
        u.name AS kasir,
        COUNT(t.id)           AS total_transaksi,
        SUM(t.total_amount)   AS total_penjualan,
        AVG(t.total_amount)   AS rata_rata_transaksi,
        MAX(t.total_amount)   AS transaksi_terbesar,
        MIN(t.total_amount)   AS transaksi_terkecil
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY u.id, u.name
      ORDER BY total_penjualan DESC
    `, params);
    res.json(rows);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil laporan per kasir' });
  }
});

// =============================================
// LAPORAN PER JAM
// GET /api/reports/by-hour?from=&to=
// Distribusi transaksi per jam (0-23)
// Berguna untuk tahu jam ramai
// =============================================
app.get('/api/reports/by-hour', authMiddleware, adminOnly, async (req, res) => {
  const { from, to } = req.query;

  let conditions = ['1=1'];
  let params     = [];

  if (from) { conditions.push(`DATE(created_at) >= ?`); params.push(from); }
  if (to)   { conditions.push(`DATE(created_at) <= ?`); params.push(to);   }

  try {
    const [rows] = await db.query(`
      SELECT
        HOUR(created_at)    AS jam,
        COUNT(*)            AS total_transaksi,
        SUM(total_amount)   AS total_penjualan
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      GROUP BY HOUR(created_at)
      ORDER BY jam ASC
    `, params);

    // Isi jam yang kosong dengan 0 agar grafik tidak bolong
    const fullHours = Array.from({ length: 24 }, (_, i) => {
      const found = rows.find(r => r.jam === i);
      return {
        jam              : i,
        label            : `${String(i).padStart(2,'0')}:00`,
        total_transaksi  : found ? found.total_transaksi  : 0,
        total_penjualan  : found ? Number(found.total_penjualan) : 0,
      };
    });

    res.json(fullHours);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil laporan per jam' });
  }
});

// =============================================
// SUMMARY DASHBOARD
// GET /api/reports/summary
// Angka ringkasan untuk stat cards di atas laporan
// =============================================
app.get('/api/reports/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [[today_row]]  = await db.query(`
      SELECT COUNT(*) AS trx, COALESCE(SUM(total_amount),0) AS total
      FROM transactions WHERE DATE(created_at) = ?
    `, [today]);

    const [[month_row]]  = await db.query(`
      SELECT COUNT(*) AS trx, COALESCE(SUM(total_amount),0) AS total
      FROM transactions
      WHERE YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())
    `);

    const [[all_row]] = await db.query(`
      SELECT COUNT(*) AS trx, COALESCE(SUM(total_amount),0) AS total
      FROM transactions
    `);

    // Hitung rata-rata per hari (30 hari terakhir)
    const [[avg_row]] = await db.query(`
      SELECT COALESCE(AVG(daily_total),0) AS avg_harian
      FROM (
        SELECT DATE(created_at) AS tgl, SUM(total_amount) AS daily_total
        FROM transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
      ) daily
    `);

    res.json({
      hari_ini : { transaksi: today_row.trx,  penjualan: Number(today_row.total)  },
      bulan_ini: { transaksi: month_row.trx,  penjualan: Number(month_row.total)  },
      all_time : { transaksi: all_row.trx,    penjualan: Number(all_row.total)    },
      avg_harian: Number(avg_row.avg_harian),
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil summary' });
  }
});

// ==============================================
// ===== SETTINGS TOKO ==========================
// ==============================================

// GET /api/settings — ambil semua config toko
// Dipakai kasir.html (nama toko, bank) dan admin (form pengaturan)
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT `key`, value FROM settings');
    // Ubah array [{key,value}] jadi object {key: value}
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal ambil settings' });
  }
});

// PUT /api/settings — simpan config toko, admin only
// Body: { store_name: "...", store_address: "...", ... }
app.put('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  const updates = req.body;
  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Tidak ada data yang dikirim' });
  }
  try {
    // Upsert setiap key — insert jika belum ada, update jika sudah
    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, String(value)]
      );
    }
    res.json({ message: '✅ Pengaturan berhasil disimpan' });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: 'Gagal simpan settings' });
  }
});

// =============================================
// START SERVER
// =============================================

// Buat folder logs/ otomatis jika belum ada
// Winston butuh folder ini untuk simpan log file
const fs   = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  logger.info('📁 Folder logs/ dibuat otomatis');
}

app.listen(PORT, () => {
  logger.info(`🚀 Server berjalan di http://localhost:${PORT}`);
  logger.info(`🔒 Helmet + Rate Limiter aktif`);
  logger.info(`📋 Log tersimpan di: ${logsDir}`);
  logger.info(`⚙️  Belum setup? POST ke /api/auth/setup`);
});

// Handle uncaught error agar server tidak crash diam-diam
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});
