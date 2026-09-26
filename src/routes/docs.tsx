import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Brand } from '../components/Brand'

export const Route = createFileRoute('/docs')({ component: DocsPage })

const nav = [
  { id: 'cara-kerja', label: 'Cara kerja', group: 'Mulai' },
  { id: 'autentikasi', label: 'Base URL & autentikasi', group: 'Mulai' },
  { id: 'create', label: 'POST /payments', group: 'Endpoint' },
  { id: 'detail', label: 'GET /payments/:orderId', group: 'Endpoint' },
  { id: 'status', label: 'GET .../status', group: 'Endpoint' },
  { id: 'qr', label: 'GET .../qr', group: 'Endpoint' },
  { id: 'checkout', label: 'Checkout publik', group: 'Endpoint' },
  { id: 'export', label: 'Laporan .xlsx', group: 'Endpoint' },
  { id: 'provider', label: 'Webhook dari provider', group: 'Referensi' },
  { id: 'objek', label: 'Objek Payment', group: 'Referensi' },
  { id: 'status-payment', label: 'Status & transisi', group: 'Referensi' },
  { id: 'idempotency', label: 'Idempotency', group: 'Referensi' },
  { id: 'webhook-keluar', label: 'Webhook keluar', group: 'Referensi' },
  { id: 'batas', label: 'Batas & rate limit', group: 'Referensi' },
  { id: 'error', label: 'Error', group: 'Referensi' },
  { id: 'konfigurasi', label: 'Konfigurasi server', group: 'Lainnya' },
  { id: 'health', label: 'Health check', group: 'Lainnya' },
]

const groups = [...new Set(nav.map((item) => item.group))]

function Code({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => children.replace(/\n+$/, ''), [children])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return <div className="docs-code-wrap">
    <div className="docs-code-bar">
      {label ? <span className="docs-code-label">{label}</span> : <span className="docs-code-label">example</span>}
      <button type="button" className={`docs-copy${copied ? ' copied' : ''}`} onClick={copy}>
        <span aria-hidden="true">{copied ? '✓' : '⧉'}</span> {copied ? 'Tersalin' : 'Copy'}
      </button>
    </div>
    <pre className="docs-code"><code>{text}</code></pre>
  </div>
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="docs-section">
    <h2><a className="docs-anchor" href={`#${id}`} aria-label={`Tautan ke bagian ${title}`} aria-hidden="true">#</a>{title}</h2>
    {children}
  </section>
}

function DocsPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [active, setActive] = useState(nav[0].id)
  const [query, setQuery] = useState('')
  const lockedUntil = useRef(0)

  useEffect(() => { setBaseUrl(window.location.origin) }, [])

  useEffect(() => {
    // Scrollspy dihitung dari offset absolut, bukan dari IntersectionObserver.
    // Observer bisa melewatkan section saat scroll cepat karena entry-nya di-batch
    // hanya untuk section yang persis melewati rootMargin, sehingga active meleset.
    let frame = 0

    const resolveActive = () => {
      frame = 0
      if (Date.now() < lockedUntil.current) return
      const line = window.scrollY + 132
      let current = nav[0].id
      for (const item of nav) {
        const section = document.getElementById(item.id)
        if (!section) continue
        if (section.getBoundingClientRect().top + window.scrollY <= line) current = item.id
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        const last = nav[nav.length - 1]
        if (document.getElementById(last.id)) current = last.id
      }
      setActive((previous) => (previous === current ? previous : current))
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(resolveActive)
    }

    resolveActive()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // Scroll cepat: sampling per frame bisa melewatkan posisi akhir, jadi satu
    // kali lagi setelah scroll selesai supaya active tidak tertinggal.
    window.addEventListener('scrollend', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scrollend', schedule)
    }
  }, [])

  const jump = useCallback((id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    // Kunci active selama animasi smooth scroll supaya tidak berkedip
    // mengikuti section yang dilalui di tengah perjalanan.
    lockedUntil.current = Date.now() + 900
    setActive(id)
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return nav
    return nav.filter((item) => item.label.toLowerCase().includes(term) || item.id.includes(term))
  }, [query])

  const base = baseUrl || 'https://pay.lydev.id'

  return <div className="docs-shell">
    <header className="docs-top">
      <Brand to="/dashboard" />
      <div className="docs-top-right">
        <span className="docs-chip">API v1</span>
        <a className="button button-outline docs-back" href="#atas">Ke atas ↑</a>
        <Link to="/dashboard" className="button button-outline docs-back">Dashboard ↗</Link>
      </div>
    </header>

    <div className="docs-layout">
      <nav className="docs-nav" aria-label="Daftar isi">
        <div className="docs-search">
          <span className="docs-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari bagian…"
            aria-label="Cari di dokumentasi"
          />
        </div>
        {groups.map((group) => {
          const items = filtered.filter((item) => item.group === group)
          if (!items.length) return null
          return <div key={group} className="docs-nav-group">
            <span className="side-label">{group}</span>
            {items.map((item) => <a
              key={item.id}
              href={`#${item.id}`}
              className={active === item.id ? 'active' : ''}
              onClick={(event) => { event.preventDefault(); jump(item.id) }}
            >{item.label}</a>)}
          </div>
        })}
        {filtered.length === 0 ? <p className="docs-nav-empty">Tidak ada bagian untuk &quot;{query}&quot;.</p> : null}
      </nav>

      <main className="docs-content">
        <div className="checkout-title docs-title" id="atas">
          <div className="eyebrow">DEVELOPER REFERENCE <span className="eyebrow-line" /></div>
          <h1>Dokumentasi API<span className="title-period">.</span></h1>
          <p className="muted">Cara kerja LYDEV Pay, autentikasi, seluruh endpoint, format data, webhook, dan batasannya.</p>
          <div className="docs-quick">
            <button type="button" onClick={() => jump('create')}><strong>Buat payment</strong><span>POST /api/v1/payments</span></button>
            <button type="button" onClick={() => jump('webhook-keluar')}><strong>Tercairkan otomatis</strong><span>Webhook payment.paid</span></button>
            <button type="button" onClick={() => jump('error')}><strong>Handling error</strong><span>Daftar kode &amp; pesan</span></button>
          </div>
        </div>

        <Section id="cara-kerja" title="Cara kerja">
          <p>LYDEV Pay adalah lapisan orkestrasi di atas Sumopod Pay. Backend project Anda memanggil LYDEV Pay untuk membuat tagihan QRIS; Sumopod tetap menjadi pemroses pembayarannya, dan QR disajikan ulang dari domain LYDEV Pay agar pembayar tidak pernah berpindah situs.</p>
          <Code label="alur">{`Backend project            LYDEV Pay                          Sumopod Pay
      |                         |                                    |
      |  POST /api/v1/payments  |                                    |
      |  (Bearer lypay-...)     |  buat payment (server-to-server)   |
      |------------------------>|----------------------------------->|
      |                         |<-----------------------------------|
      |   201 { orderId, ... }  |  simpan providerPaymentUrl + fee   |
      |<------------------------|  ekstrak payload QRIS -> render PNG|
      |                         |                                    |
      |  kirim checkoutUrl      |                                    |
      |  ke pembayar            |  pembayar scan QRIS                |
      |                         |                                    |
      |   webhook keluar        |<-----------------------------------|
      |<------------------------|  webhook provider (signature)      |
      |   payment.paid          |  PENDING -> PAID                   |`}</Code>
          <p>Ringkasan tanggung jawab:</p>
          <ul>
            <li><strong>LYDEV Pay</strong> — membuat order <code>LY-...</code>, menyimpan provider payment, menyajikan QR, memverifikasi webhook provider, menyimpan status sebagai sumber kebenaran, dan mengirim webhook keluar ke project Anda.</li>
            <li><strong>Sumopod</strong> — membuat tagihan QRIS, menerima pembayaran, dan mengirim notifikasi status.</li>
            <li><strong>Backend project</strong> — memanggil API LYDEV Pay dengan API key, menampilkan <code>checkoutUrl</code> ke pembayar, dan menerima webhook keluar untuk memperbarui order internalnya.</li>
          </ul>
          <p>Status pembayaran <strong>hanya</strong> berubah menjadi <code>PAID</code> setelah webhook provider tervalidasi (signature, identitas payment, dan nominal). Halaman checkout tidak pernah menandai lunas.</p>
          <h3>Alur pemakaian singkat</h3>
          <Code label="quickstart">{`# 1. Buat payment (server-to-server, dari backend project)
curl -X POST "${base}/api/v1/payments" \\
  -H "Authorization: Bearer lypay-xxxxxxxx" \\
  -H "Idempotency-Key: order-2026-0001" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":50000,"currency":"IDR","description":"Top up saldo"}'

# 2. Kirim field checkoutUrl dari respons ke pembayar
#    (pembayar membuka halaman LYDEV Pay, scan QRIS)

# 3. Terima webhook keluar "payment.paid" di backend Anda, verifikasi signature,
#    lalu tandai order internal lunas.`}</Code>
        </Section>

        <Section id="autentikasi" title="Base URL & autentikasi">
          <p>Semua endpoint berada di bawah base URL berikut:</p>
          <Code label="base url">{`${base}`}</Code>
          <h3>Dua model autentikasi</h3>
          <table>
            <thead><tr><th>Model</th><th>Dipakai untuk</th><th>Cara</th></tr></thead>
            <tbody>
              <tr><td>Project API key</td><td>Panggilan server-ke-server dari backend project</td><td>Header <code>Authorization: Bearer lypay-...</code></td></tr>
              <tr><td>Sesi operator</td><td>Halaman browser (dashboard, docs) dan endpoint admin</td><td>Cookie sesi HttpOnly dari <code>/login</code></td></tr>
            </tbody>
          </table>
          <p>API key dibuat di dashboard, tab <strong>Project &amp; API</strong>, dan hanya ditampilkan <strong>sekali</strong> saat dibuat. Formatnya <code>lypay-</code> diikuti 48 karakter acak. Server menyimpan hanya hash SHA-256 (<code>API_KEY_PEPPER</code> + key), jadi key mentah tidak bisa dilihat lagi — simpan di secret manager.</p>
          <p>Key hanya berlaku untuk project pemiliknya. Endpoint <code>GET</code> payment juga menerima API key, tetapi hanya untuk payment milik project yang sama; kalau bukan pemiliknya, server membalas <code>404</code> (bukan <code>403</code>) agar keberadaan order tidak bocor.</p>
        </Section>

        <Section id="create" title="POST /api/v1/payments — buat pembayaran">
          <h3><span className="method post">POST</span> <code>/api/v1/payments</code></h3>
          <table>
            <thead><tr><th>Header</th><th>Wajib</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr><td><code>Authorization</code></td><td>Ya</td><td><code>Bearer lypay-...</code></td></tr>
              <tr><td><code>Idempotency-Key</code></td><td>Ya</td><td>8–128 karakter, pola <code>[A-Za-z0-9._:-]</code>. Amankan dari request ganda.</td></tr>
              <tr><td><code>Content-Type</code></td><td>Ya</td><td><code>application/json</code></td></tr>
            </tbody>
          </table>
          <h3>Body</h3>
          <table>
            <thead><tr><th>Field</th><th>Tipe</th><th>Wajib</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr><td><code>amount</code></td><td>integer</td><td>Ya</td><td>Nominal dasar dalam IDR. Minimal <code>MIN_PAYMENT_AMOUNT</code> (default 10.000), maksimal <code>MAX_PAYMENT_AMOUNT</code>.</td></tr>
              <tr><td><code>currency</code></td><td>string</td><td>Ya</td><td>Hanya <code>IDR</code>.</td></tr>
              <tr><td><code>description</code></td><td>string</td><td>Tidak</td><td>Maksimal 240 karakter. Muncul di halaman checkout dan laporan.</td></tr>
              <tr><td><code>externalReference</code></td><td>string</td><td>Tidak</td><td>Maksimal 100 karakter. ID order di sistem Anda, dikembalikan di webhook.</td></tr>
              <tr><td><code>customer.name</code> / <code>customer.email</code></td><td>string</td><td>Tidak</td><td>Maksimal 100 karakter / email valid.</td></tr>
              <tr><td><code>metadata</code></td><td>object</td><td>Tidak</td><td>Nilai string/number/boolean/null. Total maksimal 4000 karakter JSON.</td></tr>
            </tbody>
          </table>
          <Code label="curl — create">{`curl -X POST "${base}/api/v1/payments" \\
  -H "Authorization: Bearer lypay-xxxxxxxx" \\
  -H "Idempotency-Key: order-2026-0001" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 50000,
    "currency": "IDR",
    "description": "Top up saldo",
    "externalReference": "ORDER-2026-0001",
    "customer": { "name": "Budi", "email": "budi@example.com" },
    "metadata": { "productId": "topup-50k" }
  }'`}</Code>
          <p>Respons <code>201 Created</code>:</p>
          <Code label="201 Created">{`{
  "orderId": "LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "status": "PENDING",
  "amount": 50000,
  "fee": 1500,
  "providerAmount": 51500,
  "currency": "IDR",
  "description": "Top up saldo",
  "externalReference": "ORDER-2026-0001",
  "expiresAt": "2026-09-27T10:15:00.000Z",
  "paidAt": null,
  "createdAt": "2026-09-26T10:15:00.000Z",
  "checkoutUrl": "${base}/pay/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "qrUrl": "${base}/api/v1/payments/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC/qr"
}`}</Code>
          <p><code>amount</code> adalah nominal dasar. Kalau provider menambahkan biaya di atasnya, <code>providerAmount</code> adalah total yang dibayar pelanggan dan <code>fee</code> adalah biaya layanannya. <code>providerAmount</code> dan <code>fee</code> bisa <code>null</code> bila provider belum mengembalikannya.</p>
          <p>QR disiapkan setelah payment dibuat. Bila ekstraksi QR gagal, payment tetap <code>PENDING</code> dan bisa diambil ulang dari dashboard. Nominal tagihan QRIS memakai nilai gross (<code>providerAmount</code>).</p>
        </Section>

        <Section id="detail" title="GET /api/v1/payments/:orderId — detail pembayaran">
          <h3><span className="method get">GET</span> <code>/api/v1/payments/:orderId</code></h3>
          <p>Mengembalikan objek payment lengkap. Menerima sesi operator atau API key project pemilik. Payment <code>PENDING</code> yang sudah lewat <code>expiresAt</code> otomatis ditandai <code>EXPIRED</code> saat endpoint ini dipanggil.</p>
          <Code label="curl — detail">{`curl "${base}/api/v1/payments/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC" \\
  -H "Authorization: Bearer lypay-xxxxxxxx"`}</Code>
          <p>Format respons sama dengan objek pada <code>POST /payments</code>. Bila tidak ditemukan atau bukan milik project Anda: <code>{'404 { "error": "Not found" }'}</code>.</p>
        </Section>

        <Section id="status" title="GET /api/v1/payments/:orderId/status — cek status">
          <h3><span className="method get">GET</span> <code>/api/v1/payments/:orderId/status</code></h3>
          <p>Sama seperti endpoint detail, tetapi ditandai sebagai endpoint ringan untuk polling status. Respons memakai header <code>Cache-Control: no-store</code>.</p>
          <Code label="curl — status">{`curl "${base}/api/v1/payments/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC/status" \\
  -H "Authorization: Bearer lypay-xxxxxxxx"

# 200
{ "orderId": "LY-01K5...", "status": "PAID", "amount": 50000, "paidAt": "2026-09-26T10:17:04.000Z", ... }`}</Code>
          <p>Rekomendasi: saat status sudah final (<code>PAID</code>, <code>FAILED</code>, <code>EXPIRED</code>, <code>CANCELLED</code>, <code>REFUNDED</code>), hentikan polling dan andalkan webhook keluar untuk perubahan berikutnya.</p>
        </Section>

        <Section id="qr" title="GET /api/v1/payments/:orderId/qr — gambar QR">
          <h3><span className="method get">GET</span> <code>/api/v1/payments/:orderId/qr</code></h3>
          <p>Mengembalikan PNG payload QRIS. Hanya tersedia untuk payment berstatus <code>PENDING</code> yang belum kedaluwarsa; selain itu <code>404</code> dengan body teks biasa (<strong>bukan</strong> JSON).</p>
          <table>
            <thead><tr><th>Status</th><th>Body</th><th>Arti</th></tr></thead>
            <tbody>
              <tr><td><code>200</code></td><td><code>image/png</code></td><td>Gambar QR siap dipakai.</td></tr>
              <tr><td><code>404</code></td><td><code>Not found</code></td><td>Payment tidak ada, bukan milik Anda, atau status bukan <code>PENDING</code>.</td></tr>
              <tr><td><code>404</code></td><td><code>QR belum tersedia</code></td><td>Payment ada, tetapi QR belum/tidak berhasil diekstrak.</td></tr>
            </tbody>
          </table>
          <p>Header respons menyertakan <code>Cache-Control: private, no-store</code> dan <code>X-Content-Type-Options: nosniff</code>.</p>
        </Section>

        <Section id="checkout" title="Checkout publik (tanpa kredensial)">
          <p>Halaman <code>/pay/:orderId</code> dan dua endpoint di bawahnya bersifat <strong>publik</strong>: <code>orderId</code> (ULID) berlaku sebagai tautan kapabilitas, sama seperti tautan pembayaran provider. Pembayar tanpa akun bisa membuka, memindai QR, dan mengunduh gambarnya.</p>
          <table>
            <thead><tr><th>Endpoint</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr><td><code>GET /pay/:orderId</code></td><td>Halaman checkout (HTML) dengan status yang diperiksa otomatis tiap 5 detik.</td></tr>
              <tr><td><code>GET /api/pay/:orderId</code></td><td>Status publik. Field sensitif seperti <code>externalReference</code> selalu <code>null</code>.</td></tr>
              <tr><td><code>GET /api/pay/:orderId/qr</code></td><td>Gambar QR. Tersedia untuk status <code>PENDING</code> dan <code>PAID</code>.</td></tr>
            </tbody>
          </table>
          <Code label="200 OK — status publik">{`curl "${base}/api/pay/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC"

{
  "orderId": "LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "status": "PENDING",
  "currency": "IDR",
  "amount": 50000,
  "fee": 1500,
  "providerAmount": 51500,
  "description": "Top up saldo",
  "externalReference": null,
  "expiresAt": "2026-09-27T10:15:00.000Z",
  "paidAt": null,
  "createdAt": "2026-09-26T10:15:00.000Z",
  "checkoutUrl": "/pay/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "qrUrl": "/api/pay/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC/qr",
  "hasQr": true
}`}</Code>
          <p>Tautan yang sudah lewat 24 jam tanpa pembayaran tidak lagi berlaku dan membalas <code>{'404 { "error": "Not found" }'}</code>; halaman checkout menampilkan &quot;Link tidak berlaku&quot;. Payment yang sudah <code>PAID</code> tetap bisa dibuka.</p>
          <p>Endpoint publik ini <strong>tanpa operasi tulis</strong> — tidak ada cara menandai lunas dari sisi browser.</p>
        </Section>

        <Section id="export" title="GET /api/admin/payments/export — laporan Excel">
          <h3><span className="method get">GET</span> <code>/api/admin/payments/export</code></h3>
          <p>Mengunduh seluruh transaksi sebagai <code>.xlsx</code> siap dibuka di Excel/Google Sheets/LibreOffice. Hanya untuk <strong>sesi operator</strong> — tanpa sesi membalas <code>401</code> teks biasa. Tombolnya ada di dashboard pada panel <strong>Recent Activity</strong>.</p>
          <Code label="header respons">{`# dari browser (cookie sesi terkirim otomatis)
${base}/api/admin/payments/export

# header respons
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="lydev-pay-transaksi-20260926-1730.xlsx"`}</Code>
          <p>Kolom laporan: Order ID, Project, Deskripsi, Nominal Dasar, Fee, Total Dibayar, Status, Dibuat, Dibayar Pada. Nominal disimpan sebagai angka (bukan teks) memakai format ribuan.</p>
        </Section>

        <Section id="provider" title="Webhook dari provider">
          <h3><span className="method post">POST</span> <code>/api/webhooks/sumopod</code></h3>
          <p>Endpoint ini <strong>dipanggil Sumopod</strong>, bukan oleh aplikasi Anda. Header signature memakai skema Svix (<code>svix-id</code>, <code>svix-timestamp</code>, <code>svix-signature</code>) dan diverifikasi terhadap <code>SUMOPOD_WEBHOOK_SECRET</code>, dengan toleransi waktu dan idempotensi berdasarkan <code>svix-id</code>.</p>
          <table>
            <thead><tr><th>Event provider</th><th>Efek</th></tr></thead>
            <tbody>
              <tr><td><code>payment.completed</code></td><td><code>PENDING</code> → <code>PAID</code>, mengisi <code>paidAt</code> dan <code>paymentMethod</code>.</td></tr>
              <tr><td><code>payment.failed</code></td><td><code>PENDING</code> → <code>FAILED</code>.</td></tr>
              <tr><td><code>payment.expired</code></td><td><code>PENDING</code> → <code>EXPIRED</code>.</td></tr>
              <tr><td><code>payment.test</code></td><td>Dibalas <code>200</code> tanpa mengubah data (event uji dari halaman provider).</td></tr>
            </tbody>
          </table>
          <p>Sebelum status diubah, server memverifikasi: signature sah, <code>order_id</code> dikenal, <code>payment_id</code> cocok dengan provider payment yang tersimpan, dan nominal termasuk nominal dasar atau gross yang diketahui. Ketidakcocokan dibalas <code>400</code>. Body lebih dari 64 KB dibalas <code>413</code>. Event yang sama diulang akan dibalas <code>200</code> tanpa efek ganda.</p>
          <p>Anda tidak perlu memanggil endpoint ini. Kalau URL webhook provider perlu didaftarkan ulang, isi <code>{base}/api/webhooks/sumopod</code> di pengaturan Sumopod.</p>
        </Section>

        <Section id="objek" title="Objek Payment">
          <table>
            <thead><tr><th>Field</th><th>Tipe</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr><td><code>orderId</code></td><td>string</td><td>ID publik LYDEV, format <code>LY-</code> + ULID.</td></tr>
              <tr><td><code>status</code></td><td>string</td><td><code>CREATED</code>, <code>PENDING</code>, <code>PAID</code>, <code>FAILED</code>, <code>EXPIRED</code>, <code>CANCELLED</code>, <code>REFUNDED</code>.</td></tr>
              <tr><td><code>amount</code></td><td>integer</td><td>Nominal dasar yang diminta.</td></tr>
              <tr><td><code>fee</code></td><td>integer | null</td><td>Biaya layanan provider.</td></tr>
              <tr><td><code>providerAmount</code></td><td>integer | null</td><td>Total yang dibayar pelanggan (nominal dasar + fee).</td></tr>
              <tr><td><code>currency</code></td><td>string</td><td>Selalu <code>IDR</code>.</td></tr>
              <tr><td><code>description</code></td><td>string | null</td><td>Deskripsi transaksi.</td></tr>
              <tr><td><code>externalReference</code></td><td>string | null</td><td>ID order di sistem Anda (null di endpoint publik).</td></tr>
              <tr><td><code>expiresAt</code></td><td>ISO 8601 | null</td><td>Batas waktu pembayaran (24 jam).</td></tr>
              <tr><td><code>paidAt</code></td><td>ISO 8601 | null</td><td>Waktu pembayaran terkonfirmasi.</td></tr>
              <tr><td><code>createdAt</code></td><td>ISO 8601</td><td>Waktu order dibuat.</td></tr>
              <tr><td><code>checkoutUrl</code></td><td>string</td><td>URL halaman checkout untuk dikirim ke pembayar.</td></tr>
              <tr><td><code>qrUrl</code></td><td>string</td><td>URL gambar QR.</td></tr>
            </tbody>
          </table>
          <p>Field internal seperti <code>providerPaymentUrl</code>, <code>providerPaymentId</code>, ID database, dan metadata provider <strong>tidak pernah</strong> dikirim ke klien.</p>
        </Section>

        <Section id="status-payment" title="Status & transisi">
          <Code label="state machine">{`CREATED
   |
   v
PENDING ------------> PAID ------------> REFUNDED
   |
   +---------------> FAILED
   |
   +---------------> EXPIRED
   |
   +---------------> CANCELLED`}</Code>
          <table>
            <thead><tr><th>Status</th><th>Arti</th><th>Yang harus dilakukan backend Anda</th></tr></thead>
            <tbody>
              <tr><td><code>CREATED</code></td><td>Order dibuat, provider belum merespons.</td><td>Tunggu; status jarang terlihat karena cepat berpindah.</td></tr>
              <tr><td><code>PENDING</code></td><td>Menunggu pembayaran. QR tersedia.</td><td>Tampilkan <code>checkoutUrl</code>; boleh polling status.</td></tr>
              <tr><td><code>PAID</code></td><td>Pembayaran terkonfirmasi provider.</td><td>Tandai order internal lunas (dari webhook).</td></tr>
              <tr><td><code>FAILED</code></td><td>Pembayaran gagal.</td><td>Tandai gagal, tawarkan order baru.</td></tr>
              <tr><td><code>EXPIRED</code></td><td>Lewat 24 jam tanpa pembayaran.</td><td>Tandai kedaluwarsa.</td></tr>
              <tr><td><code>CANCELLED</code></td><td>Dibatalkan.</td><td>Tandai batal.</td></tr>
              <tr><td><code>REFUNDED</code></td><td>Dana dikembalikan (setelah <code>PAID</code>).</td><td>Tandai refund.</td></tr>
            </tbody>
          </table>
          <p>Transisi hanya boleh mengikuti arah di atas. Webhook provider yang berulang untuk status yang sama dibalas sukses tanpa mengubah data lagi.</p>
        </Section>

        <Section id="idempotency" title="Idempotency">
          <p><code>Idempotency-Key</code> wajib pada <code>POST /api/v1/payments</code>. Pakai nilai unik per order (mis. ID order internal Anda). Perilakunya:</p>
          <ul>
            <li>Request pertama membuat payment baru dan mengembalikan <code>201</code>.</li>
            <li>Request ulang dengan key <strong>dan</strong> body sama mengembalikan payment yang sama (aman dari retry jaringan).</li>
            <li>Key sama dengan body berbeda → <code>409</code> <code>{'{ "error": "Idempotency-Key dipakai untuk request berbeda." }'}</code>.</li>
            <li>Key sama saat request pertama masih diproses → <code>409</code> (Coba lagi sebentar).</li>
          </ul>
          <Code label="retry aman">{`# Retry yang aman: key yang sama, body yang sama
curl -X POST "${base}/api/v1/payments" \\
  -H "Authorization: Bearer lypay-xxxxxxxx" \\
  -H "Idempotency-Key: ORDER-2026-0001" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":50000,"currency":"IDR"}'`}</Code>
        </Section>

        <Section id="webhook-keluar" title="Webhook keluar (ke backend Anda)">
          <p>Kalau project Anda punya <code>webhookUrl</code>, LYDEV Pay mengirim notifikasi setiap status berubah final. Secret dibuat di dashboard (tab <strong>Project &amp; API</strong>) dan hanya ditampilkan sekali; formatnya <code>lywhsec_...</code>.</p>
          <table>
            <thead><tr><th>Event</th><th>Kapan dikirim</th></tr></thead>
            <tbody>
              <tr><td><code>payment.paid</code></td><td>Saat payment menjadi <code>PAID</code>.</td></tr>
              <tr><td><code>payment.failed</code></td><td>Saat payment menjadi <code>FAILED</code>.</td></tr>
              <tr><td><code>payment.expired</code></td><td>Saat payment menjadi <code>EXPIRED</code>.</td></tr>
            </tbody>
          </table>
          <h3>Header</h3>
          <table>
            <thead><tr><th>Header</th><th>Isi</th></tr></thead>
            <tbody>
              <tr><td><code>X-Lydev-Event</code></td><td>Nama event, mis. <code>payment.paid</code>.</td></tr>
              <tr><td><code>X-Lydev-Timestamp</code></td><td>Unix timestamp detik saat pengiriman.</td></tr>
              <tr><td><code>X-Lydev-Delivery</code></td><td>ID pengiriman, unik per percobaan.</td></tr>
              <tr><td><code>X-Lydev-Signature</code></td><td><code>v1,</code> + base64url HMAC-SHA256.</td></tr>
            </tbody>
          </table>
          <p>Signature dihitung dari <code>HMAC-SHA256(secret, timestamp + "." + rawBody)</code>. Body harus dipakai <strong>mentah</strong> (sebelum parsing ulang) agar tanda tangan tetap cocok.</p>
          <h3>Payload</h3>
          <Code label="payload">{`{
  "event": "payment.paid",
  "deliveryId": "clx1234abcd",
  "createdAt": "2026-09-26T10:17:04.000Z",
  "data": {
    "orderId": "LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
    "status": "PAID",
    "amount": 50000,
    "fee": 1500,
    "providerAmount": 51500,
    "currency": "IDR",
    "description": "Top up saldo",
    "externalReference": "ORDER-2026-0001",
    "expiresAt": "2026-09-27T10:15:00.000Z",
    "paidAt": "2026-09-26T10:17:04.000Z",
    "createdAt": "2026-09-26T10:15:00.000Z",
    "checkoutUrl": "${base}/pay/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
    "qrUrl": "${base}/api/v1/payments/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC/qr",
    "projectId": "clx0000project"
  }
}`}</Code>
          <h3>Verifikasi (Node.js)</h3>
          <Code label="node.js">{`import crypto from 'node:crypto'

app.post('/hooks/lydev', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body.toString('utf8')
  const timestamp = req.headers['x-lydev-timestamp']
  const signature = req.headers['x-lydev-signature']

  const expected = crypto.createHmac('sha256', process.env.LYDEV_WEBHOOK_SECRET!)
    .update(timestamp + '.' + raw)
    .digest('base64url')

  const valid = signature === 'v1,' + expected
  if (!valid) return res.status(401).send('invalid signature')

  const event = JSON.parse(raw)
  if (event.event === 'payment.paid') {
    // tandai order internal lunas berdasarkan event.data.externalReference
  }
  res.json({ ok: true })
})`}</Code>
          <h3>Verifikasi (PHP)</h3>
          <Code label="php">{`\$raw = file_get_contents('php://input');
\$timestamp = \$_SERVER['HTTP_X_LYDEV_TIMESTAMP'] ?? '';
\$signature = \$_SERVER['HTTP_X_LYDEV_SIGNATURE'] ?? '';

\$expected = 'v1,' . rtrim(strtr(base64_encode(
  hash_hmac('sha256', \$timestamp . '.' . \$raw, \$webhookSecret, true)
), '+/', '-_'), '=');

if (!hash_equals(\$expected, \$signature)) {
  http_response_code(401);
  exit('invalid signature');
}

\$event = json_decode(\$raw, true);
if (\$event['event'] === 'payment.paid') {
  // tandai order lunas
}
echo json_encode(['ok' => true]);`}</Code>
          <h3>Retry</h3>
          <ul>
            <li>Maksimal 5 percobaan dengan jeda 30 detik, 2 menit, 10 menit, 1 jam, lalu 6 jam.</li>
            <li>Timeout 10 detik per percobaan. Balas <code>2xx</code> secepat mungkin; pekerjaan berat taruh di antrean.</li>
            <li>Hasil akhir dicatat sebagai event <code>webhook.delivered</code> atau <code>webhook.failed</code>.</li>
            <li>URL wajib HTTPS, kecuali <code>localhost</code> dan <code>127.0.0.1</code> untuk pengujian lokal.</li>
            <li>Pengiriman bersifat <em>at-least-once</em>: pakai <code>deliveryId</code> atau <code>orderId</code> + <code>event</code> sebagai kunci idempotensi di sisi Anda.</li>
          </ul>
        </Section>

        <Section id="batas" title="Batas & rate limit">
          <table>
            <thead><tr><th>Aturan</th><th>Nilai</th></tr></thead>
            <tbody>
              <tr><td>Nominal minimal</td><td><code>MIN_PAYMENT_AMOUNT</code> (default 10.000). Di bawah ini ditolak <code>400</code>.</td></tr>
              <tr><td>Nominal maksimal</td><td><code>MAX_PAYMENT_AMOUNT</code> (default 10.000.000).</td></tr>
              <tr><td>Masa berlaku tagihan</td><td>24 jam, lalu <code>EXPIRED</code>.</td></tr>
              <tr><td>Rate limit pembuatan payment</td><td>10 request / menit / project. Melebihi batas: <code>429</code> + header <code>Retry-After</code> (detik).</td></tr>
              <tr><td>Batas ukuran webhook provider</td><td>64 KB.</td></tr>
              <tr><td>Rate limit login operator</td><td>5 percobaan / 15 menit per IP.</td></tr>
            </tbody>
          </table>
          <p>Rate limit pembuatan payment disimpan di memori proses. Kalau nanti dijalankan di beberapa instance, pindahkan ke penyimpanan bersama (Redis) atau reverse proxy.</p>
        </Section>

        <Section id="error" title="Error">
          <p>Semua error JSON memakai bentuk sederhana:</p>
          <Code label="bentuk error">{`{ "error": "pesan yang bisa langsung ditampilkan" }`}</Code>
          <table>
            <thead><tr><th>HTTP</th><th>Pesan</th><th>Kapan</th></tr></thead>
            <tbody>
              <tr><td><code>400</code></td><td><code>Request tidak valid.</code></td><td>JSON rusak atau field gagal validasi.</td></tr>
              <tr><td><code>400</code></td><td><code>Jumlah minimal pembayaran Rp 10.000.</code></td><td><code>amount</code> di bawah batas minimal.</td></tr>
              <tr><td><code>400</code></td><td><code>Jumlah melebihi batas konfigurasi.</code></td><td><code>amount</code> di atas batas maksimal.</td></tr>
              <tr><td><code>400</code></td><td><code>Metadata terlalu besar.</code></td><td>JSON <code>metadata</code> melebihi 4000 karakter.</td></tr>
              <tr><td><code>400</code></td><td><code>Idempotency-Key tidak valid.</code></td><td>Header tidak ada atau formatnya salah.</td></tr>
              <tr><td><code>401</code></td><td><code>Invalid project API key</code></td><td>API key salah, nonaktif, atau project nonaktif.</td></tr>
              <tr><td><code>404</code></td><td><code>Not found</code></td><td>Payment tidak ada, bukan milik Anda, atau tautan kedaluwarsa.</td></tr>
              <tr><td><code>409</code></td><td><code>Idempotency-Key dipakai untuk request berbeda.</code></td><td>Key sama, body berbeda.</td></tr>
              <tr><td><code>409</code></td><td><code>Pembayaran masih diproses. Coba lagi sebentar.</code></td><td>Retry saat payment pertama belum selesai dibuat.</td></tr>
              <tr><td><code>429</code></td><td><code>Terlalu banyak payment dibuat. Coba lagi sebentar.</code></td><td>Rate limit pembuatan payment.</td></tr>
              <tr><td><code>503</code></td><td><code>Gagal membuat pembayaran.</code></td><td>Provider tidak bisa dihubungi atau konfigurasi bermasalah. Aman untuk di-retry dengan key sama.</td></tr>
            </tbody>
          </table>
          <p>Endpoint gambar QR memakai body teks biasa (<code>Not found</code> / <code>QR belum tersedia</code>), dan endpoint admin membalas <code>401</code> teks <code>Unauthorized</code> tanpa sesi.</p>
        </Section>

        <Section id="konfigurasi" title="Konfigurasi server">
          <table>
            <thead><tr><th>Variabel</th><th>Default</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr><td><code>APP_URL</code></td><td>—</td><td>Base URL publik, wajib HTTPS di production. Dipakai untuk <code>checkoutUrl</code> dan atribut cookie sesi.</td></tr>
              <tr><td><code>DATABASE_URL</code></td><td>—</td><td>Koneksi PostgreSQL (wajib <code>postgresql://</code>).</td></tr>
              <tr><td><code>SESSION_PASSWORD</code></td><td>—</td><td>Kunci enkripsi cookie sesi, minimal 32 karakter.</td></tr>
              <tr><td><code>API_KEY_PEPPER</code></td><td>—</td><td>Pepper hash API key, minimal 32 karakter.</td></tr>
              <tr><td><code>MIN_PAYMENT_AMOUNT</code></td><td><code>10000</code></td><td>Batas bawah nominal.</td></tr>
              <tr><td><code>MAX_PAYMENT_AMOUNT</code></td><td><code>10000000</code></td><td>Batas atas nominal.</td></tr>
              <tr><td><code>SUMOPOD_ENV</code></td><td>—</td><td><code>sandbox</code> / <code>production</code>. Production menolak base URL sandbox.</td></tr>
              <tr><td><code>SUMOPOD_API_BASE_URL</code></td><td>—</td><td>Base URL API Sumopod.</td></tr>
              <tr><td><code>SUMOPOD_API_KEY</code></td><td><code>&quot;&quot;</code></td><td>Wajib di production.</td></tr>
              <tr><td><code>SUMOPOD_WEBHOOK_SECRET</code></td><td><code>&quot;&quot;</code></td><td>Wajib <code>whsec_...</code> di production.</td></tr>
              <tr><td><code>SUMOPOD_ALLOWED_PAYMENT_HOSTS</code></td><td>—</td><td>Allowlist host halaman pembayaran provider (proteksi SSRF).</td></tr>
              <tr><td><code>TRUSTED_PROXY_HEADER</code></td><td><code>cf-connecting-ip</code></td><td>Header IP dari reverse proxy untuk rate limit login.</td></tr>
              <tr><td><code>QR_BROWSER_ENABLED</code></td><td><code>true</code></td><td>Fallback render QR pakai browser headless (<code>false</code> di container production).</td></tr>
            </tbody>
          </table>
          <p>Di production, aplikasi menolak start bila <code>APP_URL</code> bukan HTTPS, <code>SUMOPOD_API_KEY</code> kosong, atau <code>SUMOPOD_WEBHOOK_SECRET</code> tidak berawalan <code>whsec_</code>.</p>
        </Section>

        <Section id="health" title="Health check">
          <h3><span className="method get">GET</span> <code>/api/health</code></h3>
          <p>Endpoint publik tanpa kredensial untuk memantau layanan. Tidak membocorkan konfigurasi.</p>
          <Code label="curl — health">{`curl "${base}/api/health"

{ "status": "ok", "service": "lydev-pay" }`}</Code>
        </Section>

        <div className="docs-footer">
          <p className="muted">Butuh mencoba endpoint langsung? Panel <strong>Endpoint untuk pengujian</strong> di dashboard bisa memanggil <code>POST /api/v1/payments</code> dan <code>GET</code> payment dari browser.</p>
          <Link to="/dashboard" className="button button-primary">Buka dashboard ↗</Link>
        </div>
      </main>
    </div>
  </div>
}
