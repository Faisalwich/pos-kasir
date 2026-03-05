// =============================================
// SERVICE WORKER — POS Kasir PWA
// Mengelola cache agar app bisa dibuka offline
// =============================================

const CACHE_NAME = 'pos-kasir-v1';

// File yang di-cache untuk offline support
// Hanya file statis (HTML, font) — API request tetap butuh internet
const STATIC_ASSETS = [
  './login.html',
  './kasir.html',
  './admin.html',
  './manifest.json',
];

// =============================================
// EVENT: INSTALL
// Dipanggil saat service worker pertama kali dipasang
// Langsung cache semua file statis
// =============================================
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Paksa SW baru langsung aktif tanpa tunggu tab ditutup
  self.skipWaiting();
});

// =============================================
// EVENT: ACTIVATE
// Dipanggil saat SW baru mengambil alih
// Bersihkan cache lama jika ada
// =============================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME) // Hapus cache versi lama
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Ambil kontrol semua tab yang sudah terbuka
  self.clients.claim();
});

// =============================================
// EVENT: FETCH
// Dipanggil setiap ada request dari aplikasi
// Strategi: Network First untuk API, Cache First untuk file statis
// =============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Jangan intercept request ke API backend
  // — API butuh koneksi internet, biarkan langsung ke network
  if (url.port === '3000' || url.hostname !== location.hostname) {
    return; // Skip, tidak di-cache
  }

  // Untuk file statis: coba cache dulu, fallback ke network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // File ada di cache — kembalikan dari cache (lebih cepat)
        return cached;
      }
      // Tidak ada di cache — ambil dari network
      return fetch(event.request).then(response => {
        // Simpan response ke cache untuk request berikutnya
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      });
    })
  );
});
