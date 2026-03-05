// =============================================
// LOGGER — POS Kasir
// Pakai Winston untuk catat log ke file & console
//
// Level log (urutan prioritas):
//   error   → kesalahan fatal (crash, DB error)
//   warn    → peringatan (login gagal, rate limit)
//   info    → info normal (server start, transaksi)
//   debug   → detail teknis (hanya saat development)
// =============================================
const { createLogger, format, transports } = require('winston');
const path = require('path');

// Format log: [2024-01-15 14:30:00] ERROR: pesan
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    // Tambahkan data extra jika ada (misal: IP, user)
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${extra}`;
  })
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [

    // Semua log (info ke atas) masuk ke combined.log
    new transports.File({
      filename : path.join(__dirname, 'logs', 'combined.log'),
      maxsize  : 5 * 1024 * 1024, // Maksimal 5MB per file
      maxFiles : 3,               // Simpan 3 file terakhir (rotasi)
      tailable : true,
    }),

    // Hanya error yang masuk ke error.log
    // Berguna untuk monitoring — cukup cek file ini
    new transports.File({
      filename : path.join(__dirname, 'logs', 'error.log'),
      level    : 'error',
      maxsize  : 5 * 1024 * 1024,
      maxFiles : 3,
      tailable : true,
    }),

  ],
});

// Di mode development, tampilkan juga di console dengan warna
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] ${level}: ${message}`
      )
    ),
  }));
}

module.exports = logger;
