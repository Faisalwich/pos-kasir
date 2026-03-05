// Mengambil konfigurasi dari file .env
require("dotenv").config();

// Import mysql2 untuk koneksi ke database
const mysql = require("mysql2");

// Buat koneksi pool — lebih efisien dari koneksi biasa
// karena bisa handle banyak request sekaligus
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Export versi promise agar bisa pakai async/await
module.exports = pool.promise();
