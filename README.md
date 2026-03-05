# ⚡ POS Kasir

Sistem kasir modern berbasis web — fullstack **Node.js + MySQL + Vanilla JS**.
Dirancang untuk toko kecil-menengah, bisa dipakai lokal maupun di-deploy ke cloud.

![Node.js](https://img.shields.io/badge/Node.js-v20-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-v5-000000?style=flat&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat&logo=mysql&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat&logo=pwa&logoColor=white)

---

## ✨ Fitur

### 🧾 Kasir
- Transaksi produk dengan keranjang belanja
- Diskon nominal & persentase
- 4 metode pembayaran: **Tunai, QRIS, Transfer Bank, EDC**
- Hitung kembalian otomatis
- Cetak struk langsung dari browser

### 📦 Produk & Stok
- CRUD produk dengan kategori & icon emoji
- Monitor stok menipis + notifikasi otomatis
- Restock stok dari panel admin

### 🕐 Shift Kasir
- Buka & tutup shift dengan uang kas awal
- Rekap transaksi per shift

### 📊 Laporan & Analitik
- Grafik penjualan 14 hari terakhir
- Distribusi transaksi per jam (24 jam)
- Performa per kasir dengan ranking
- Summary: hari ini, bulan ini, rata-rata harian

### 👥 Manajemen User
- Role: **admin** dan **kasir**
- CRUD user + reset password

### ⚙️ Pengaturan Toko
- Nama toko, alamat, nomor telepon
- Rekening bank untuk payment transfer
- Footer struk — semua dinamis dari database

### 🔒 Keamanan
- JWT Authentication (token berlaku 8 jam)
- Helmet.js (security HTTP headers)
- Rate limiting: 200 req/15mnt global, 10x login/15mnt
- Winston logging ke file
- Environment variable validation

### 📱 PWA
- Bisa diinstall di HP/tablet sebagai app
- Offline support untuk file statis

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Node.js, Express v5 |
| Database | MySQL 8, mysql2 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Security | Helmet, express-rate-limit, Winston |
| Frontend | Vanilla JS, CSS Custom Properties |
| PWA | Service Worker, Web Manifest |

---

## 🚀 Cara Menjalankan

### Prasyarat
- Node.js v18+
- MySQL 8 / XAMPP

### 1. Clone repo
```bash
git clone https://github.com/Faisalwich/pos-kasir.git
cd pos-kasir
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup database
- Buka phpMyAdmin
- Buat database `pos_kasir`
- Import file `migration.sql`
- Import file `migration_v2.sql`

### 4. Konfigurasi environment
```bash
cp .env.example .env
```
Edit file `.env`:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=pos_kasir
JWT_SECRET=isi_dengan_string_random_panjang
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

Generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Jalankan server
```bash
npm start
```

### 6. Buka di browser
```
http://localhost:3000/login.html
```

### Akun default (setelah setup)
| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Kasir | kasir1 | kasir123 |

> Setup akun pertama: `POST http://localhost:3000/api/auth/setup`

---

## 📁 Struktur Project

```
pos-kasir/
├── src/
│   ├── index.js      # Server utama + semua API routes
│   ├── db.js         # Koneksi MySQL pool
│   └── logger.js     # Winston logger config
├── admin.html        # Panel admin
├── kasir.html        # Halaman kasir
├── login.html        # Halaman login
├── manifest.json     # PWA manifest
├── sw.js             # Service Worker
├── migration.sql     # Database schema awal
├── migration_v2.sql  # Tambahan tabel shifts & settings
├── .env.example      # Template environment variables
└── package.json
```

---

## 📡 API Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login |
| GET | `/api/products` | Daftar produk |
| POST | `/api/transactions/v2` | Buat transaksi |
| GET | `/api/reports/summary` | Laporan ringkasan |
| GET | `/api/reports/by-kasir` | Laporan per kasir |
| GET | `/api/reports/by-hour` | Laporan per jam |
| GET | `/api/shifts` | Daftar shift |
| GET | `/api/settings` | Pengaturan toko |
| PUT | `/api/settings` | Update pengaturan |

---

## 📋 Log Files

Log tersimpan otomatis di `src/logs/`:
- `combined.log` — semua aktivitas
- `error.log` — hanya error

---

## 📄 License

MIT License — bebas digunakan dan dimodifikasi.
