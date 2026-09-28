# LYDEV Pay

Workspace payment pribadi untuk `pay.lydev.id`, dibangun dengan TanStack Start, Prisma, PostgreSQL, dan Sumopod Pay. Seluruh halaman browser mewajibkan login operator. Backend project lain mengakses API memakai project API key. Sumopod mengirim webhook ke endpoint tersendiri dengan verifikasi signature.

## Menjalankan lokal

1. Pastikan Node.js 24 tersedia. Jalankan `npm ci`.
2. Salin `.env.example` menjadi `.env`. Isi `ADMIN_EMAIL`, `SESSION_PASSWORD` acak minimal 32 karakter, dan `API_KEY_PEPPER` acak minimal 32 karakter.
3. Buat hash password dengan `npm run admin:hash -- "password-panjang-anda"`, lalu salin hasilnya ke `ADMIN_PASSWORD_HASH` di `.env`. Tidak ada halaman registrasi publik.
4. Nyalakan PostgreSQL sesuai `docker-compose.yml`, atau arahkan `DATABASE_URL` ke PostgreSQL yang sudah ada.
5. Jalankan `npm run db:generate` dan `npm run db:deploy`.
6. Isi `SUMOPOD_API_KEY` dan `SUMOPOD_WEBHOOK_SECRET` dari project Sandbox Anda. Kedua nilai tetap di `.env`, tidak masuk repository. Atur webhook provider ke `https://pay.lydev.id/api/webhooks/sumopod` saat domain aktif.
7. Jalankan `npm run dev`, buka `http://localhost:3000/login`, lalu masuk dengan email dan password operator.

Dashboard dapat membuat project, menerbitkan API key yang ditampilkan satu kali, serta membuat payment uji. QR extractor membaca payload QRIS (EMVCo) dari halaman provider lalu merender ulang QR-nya menjadi PNG. Bila payload tidak ditemukan, ia jatuh ke gambar `img.qr-image` (halaman Sandbox), lalu merender halaman provider di browser headless. Hanya host di `SUMOPOD_ALLOWED_PAYMENT_HOSTS` yang diizinkan selama proses ini; halaman checkout production memakai host `checkout.pymnt.app`. Untuk penggunaan lokal, Chrome perlu tersedia. Pada container Linux, pasang Chromium dan isi `QR_BROWSER_EXECUTABLE_PATH`. Transaksi tetap berstatus `PENDING` jika QR belum berhasil diambil; tombol "Coba ambil ulang" tersedia di halaman checkout.

Catatan production: respons `POST /payments` mengembalikan `amount` sebagai nominal **gross** (nominal customer + `fee`) dan `net_amount` sebagai nominal yang diterima. Nilai QRIS pada tag 54 memakai nominal gross, jadi pastikan tampilan checkout mencerminkan angka tersebut.

Respons payment memuat `amount` (nominal dasar), `fee`, `providerAmount` (total yang dibayar customer), `checkoutUrl`, dan `qrUrl` (gambar QR, `image/png`). Payment berstatus `PENDING` yang melewati `expiresAt` otomatis ditandai `EXPIRED` oleh worker in-process (dan memicu webhook `payment.expired` bila webhook project aktif). Dashboard tab **Project & API** menyediakan panel pengujian untuk memanggil `POST /api/v1/payments` langsung dari browser.

Jika Anda memakai cluster PostgreSQL lokal yang dibuat di `.local-postgres/data` pada komputer ini, jalankan `scripts/start-local-db.ps1` sebelum menyalakan aplikasi. Script itu hanya mengaktifkan cluster pada `127.0.0.1:5433`; instalasi baru tetap dapat mengikuti `docker-compose.yml` atau menggunakan database sendiri.

## Endpoint

| Metode | Path | Akses |
| --- | --- | --- |
| POST | `/api/v1/payments` | Project API key dan `Idempotency-Key` |
| GET | `/api/v1/payments/:orderId` | Sesi operator atau API key project pemilik |
| GET | `/api/v1/payments/:orderId/status` | Sesi operator atau API key project pemilik |
| GET | `/api/v1/payments/:orderId/qr` | Sesi operator atau API key project pemilik |
| POST | `/api/webhooks/sumopod` | Signature Svix Sumopod |
| GET | `/api/admin/payments/export` | Sesi operator — unduh laporan transaksi `.xlsx` |
| GET | `/api/health` | Pemeriksaan status minimal |

Contoh request dari backend project:

```http
POST /api/v1/payments HTTP/1.1
Host: pay.lydev.id
Authorization: Bearer lypay-...
Idempotency-Key: project-order-2026-001
Content-Type: application/json

{"externalReference":"ORDER-001","amount":50000,"currency":"IDR","description":"Pembayaran uji QRIS"}
```

Respons berisi `orderId`, status, jumlah, tanggal kedaluwarsa, dan URL checkout LYDEV. URL provider dan rahasia tidak dikirim ke browser. `DELETE` untuk transaksi belum tersedia karena dokumentasi yang diberikan belum memuat pembatalan payment di Sumopod. Menghapus record lokal tidak akan membatalkan tagihan provider; kunci API dapat dinonaktifkan dari dashboard.

Pembuatan payment melalui API key dibatasi 10 request per menit per project pada satu proses aplikasi. Untuk beberapa instance server, gunakan rate limiter bersama di reverse proxy atau database. Halaman checkout `/pay/<orderId>` bersifat **publik dan bisa dibagikan**: `orderId` (ULID) berlaku sebagai tautan kapabilitas, sama seperti tautan pembayaran provider. Pembayar tanpa akun dapat memindai QR, menyimpan gambarnya sebagai `.png`, dan statusnya diperiksa otomatis setiap 5 detik. Tautan yang lewat 24 jam tanpa pembayaran tidak lagi berlaku dan menampilkan "Link tidak berlaku"; payment yang sudah `PAID` tetap dapat dibuka. Endpoint publiknya hanya `GET /api/pay/:orderId` dan `GET /api/pay/:orderId/qr` — keduanya tanpa kredensial, tanpa operasi tulis, dan hanya mengembalikan data yang dibutuhkan pembayar (tanpa `externalReference`).

Batas nominal pembayaran diatur `MIN_PAYMENT_AMOUNT` (default 10000) dan `MAX_PAYMENT_AMOUNT`. Amount di bawah minimal atau di atas maksimal **ditolak saat pembuatan** dengan pesan error, sehingga payment tidak pernah tercatat. Halaman checkout juga memakai Web Notifications API untuk memberi tahu "pembayaran dibuat" dan "pembayaran diterima" (permission diminta lewat tombol "Aktifkan notifikasi browser"), di samping toast dalam aplikasi. Dashboard menyediakan tombol **Unduh Excel (.xlsx)** di panel Recent Activity; file dihasilkan server tanpa dependensi tambahan.

## Webhook keluar

Selain webhook masuk dari Sumopod, LYDEV mengirim notifikasi ke backend project saat status pembayaran berubah. Atur `webhookUrl` per project di tab **Project & API**; secret hanya ditampilkan sekali dan disimpan di server.

- Event: `payment.paid`, `payment.failed`, `payment.expired`.
- Header: `X-Lydev-Event`, `X-Lydev-Timestamp`, `X-Lydev-Delivery`, `X-Lydev-Signature`.
- Signature: `v1,<base64url HMAC-SHA256(secret, "<timestamp>.<rawBody>")>`.
- Retry: maksimal 5 percobaan dengan jeda 30s, 2m, 10m, 1h, 6h dan timeout 10 detik per percobaan. Hasil akhir dicatat sebagai `PaymentEvent` `webhook.delivered` atau `webhook.failed`.
- Hanya URL HTTPS yang diterima, kecuali `localhost` dan `127.0.0.1` untuk pengujian lokal.

Contoh verifikasi di backend project (Node.js):

```js
const expected = crypto.createHmac('sha256', secret)
  .update(`${req.headers['x-lydev-timestamp']}.${rawBody}`)
  .digest('base64url')
const valid = crypto.timingSafeEqual(
  Buffer.from(req.headers['x-lydev-signature'].slice(3), 'base64url'),
  Buffer.from(expected, 'base64url'),
)
```

## Pemeriksaan

`npm run typecheck`, `npm test`, dan `npm run build`. Build produksi memakai Nitro Node dan dijalankan dengan `npm start`. Migrasi production memakai `npm run db:deploy`, bukan `db push`.

Sebelum memasang domain, siapkan PostgreSQL persisten, TLS, dan environment variables pada host. Set `APP_URL=https://pay.lydev.id`. Untuk credential production, gunakan `SUMOPOD_ENV=production` serta API base URL production yang diberikan Sumopod; konfigurasi production menolak base URL Sandbox. Jangan memakai kunci Sandbox yang pernah disalin ke chat untuk penggunaan publik; rotasi kunci tersebut di dashboard Sumopod.

## Keamanan

- Cookie sesi memakai `HttpOnly`, `SameSite=Lax`, `Path=/`, dan TTL 8 jam. Flag `Secure` ditentukan oleh skema `APP_URL`, bukan `NODE_ENV`: bila `APP_URL` https, cookie memakai nama `__Host-lydev_session` sekaligus `Secure`, sehingga tidak bisa dijatuhkan dari subdomain lain. Karena itu `APP_URL` harus benar.
- Set `NODE_ENV=production` di server. Schema env akan menolak start bila `APP_URL` bukan https, `SUMOPOD_API_KEY` kosong, atau `SUMOPOD_WEBHOOK_SECRET` bukan `whsec_...`.
- Semua respons SSR membawa `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, dan `Cross-Origin-Opener-Policy: same-origin`. Saat `APP_URL` https ditambah `Strict-Transport-Security` dan `Content-Security-Policy` (mengizinkan script/style inline milik SSR; script eksternal, `object-src`, `base-uri`, dan framing diblokir).
- Rate limit login 5 percobaan / 15 menit memakai header IP dari `TRUSTED_PROXY_HEADER` (default `cf-connecting-ip`) dan tidak lagi mempercayai `X-Forwarded-For` mentah. Setel sesuai proxy Anda dan pastikan proxy menimpa header tersebut, bukan meneruskan kiriman klien; bila header tidak ada, semua permintaan berbagi satu bucket. Verifikasi password selalu menjalankan argon2 (hash dummy bila email tidak cocok) agar email admin tidak bocor lewat waktu respons.
- `npm audit` melaporkan 4 kerentanan high pada `deepmerge-ts` dan `mysql2` yang hanya masuk lewat toolchain Prisma CLI (`@prisma/client > prisma > @prisma/config`). Paket itu tidak ikut ke bundle runtime (`.output` tidak mereferensikannya) dan aplikasi hanya memakai PostgreSQL, jadi tidak terekspos. Perbaikannya menurunkan Prisma ke 6.x (breaking), jadi sengaja tidak diambil.

## Deploy di VPS (Docker + Caddy)

Aplikasi ini tidak pernah memakai port 80/443; ia mendengarkan port internal 3000, dan Caddy yang sudah berjalan menjadi satu-satunya pintu masuk untuk semua domain.

1. Samakan network Docker dengan Caddy yang sudah ada: lihat `docker network ls`, lalu isi `CADDY_NETWORK` di `.env` sesuai nama network tersebut (default `caddy`).
2. Buat `.env` dari `deploy/.env.prod.example`. Wajib: `APP_URL=https://pay.lydev.id`, `NODE_ENV=production`, `TRUSTED_PROXY_HEADER=cf-connecting-ip`, `SUMOPOD_WEBHOOK_SECRET=whsec_...`.
3. Tambahkan blok situs dari `deploy/Caddyfile.pay.lydev.id` ke Caddyfile Caddy yang sedang berjalan (jangan menyalakan Caddy kedua), lalu reload Caddy.
4. Migrasi sekali, lalu nyalakan:
   ```sh
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
   docker compose -f docker-compose.prod.yml up -d
   ```
5. Set webhook Sumopod ke `https://pay.lydev.id/api/webhooks/sumopod`.

Catatan operasional:

- Service `postgres` sengaja tidak membuka port ke host dan hanya ada di network `internal`. Jangan menambahkan `ports:` di sana.
- `QR_BROWSER_ENABLED=false` karena image runtime tidak memuat Chrome. Ekstraksi QR memakai payload QRIS dari HTML provider dan tetap berfungsi untuk `checkout.pymnt.app`. Bila kelak butuh fallback browser, image harus ditambah Chromium plus flag `--no-sandbox` (perlu penyesuaian kode) atau memakai Playwright image resmi.
- Build image harus untuk arsitektur VPS. Lakukan build di dalam Docker seperti di atas; jangan menyalin `.output` hasil build Windows/macOS karena `argon2` adalah native module.
- Cloudflare proxy ON: blok Caddy di `deploy/Caddyfile.pay.lydev.id` membiarkan header `CF-Connecting-IP` dari Cloudflare, dan aplikasi memakai `TRUSTED_PROXY_HEADER=cf-connecting-ip`. Jangan pakai `{remote_host}` di posisi ini — di belakang Cloudflare nilainya IP edge Cloudflare sehingga semua klien satu bucket. Batasi akses ke origin hanya dari IP Cloudflare agar header tersebut tidak bisa dipalsukan. Bila tanpa Cloudflare, pakai `header_up X-Real-IP {remote_host}` dan set `TRUSTED_PROXY_HEADER=x-real-ip`.
- Rate limit login membaca elemen paling kanan dari header IP tepercaya, sehingga nilai kiriman klien tidak bisa dipakai untuk mengakali limit.
