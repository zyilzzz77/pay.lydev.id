import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Brand } from '../../components/Brand'

type Project = { id: string; name: string; slug: string; isActive: boolean; webhookUrl: string | null }
type Key = { id: string; projectId: string; prefix: string; label: string | null; isActive: boolean }
type Payment = { orderId: string; amount: number; fee: number | null; providerAmount: number | null; status: string; projectName: string; createdAt: string; hasQr: boolean }
type ApiJson = Record<string, any>
type Overview = { baseUrl: string; projects: Project[]; keys: Key[]; payments: Payment[]; metrics: { total: number; paid: number; pending: number } }

const endpoints = [
  { id: 'create', method: 'post', path: '/api/v1/payments', auth: true, param: false },
  { id: 'detail', method: 'get', path: '/api/v1/payments/:orderId', auth: true, param: true },
  { id: 'status', method: 'get', path: '/api/v1/payments/:orderId/status', auth: true, param: true },
  { id: 'qr', method: 'get', path: '/api/v1/payments/:orderId/qr', auth: true, param: true },
  { id: 'webhook', method: 'post', path: '/api/webhooks/sumopod', auth: false, param: false },
  { id: 'health', method: 'get', path: '/api/health', auth: false, param: false },
] as const

export const Route = createFileRoute('/dashboard/')({ component: Dashboard })

function money(amount: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount) }
function day(value: string) { return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<Overview | null>(null)
  const [section, setSection] = useState<'overview' | 'create' | 'api'>('overview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [rawKey, setRawKey] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [keyProject, setKeyProject] = useState('')
  const [keyLabel, setKeyLabel] = useState('')
  const [paymentProject, setPaymentProject] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [webhookProject, setWebhookProject] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [testKey, setTestKey] = useState('')
  const [testAmount, setTestAmount] = useState('10000')
  const [testReference, setTestReference] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testError, setTestError] = useState('')
  const [testEndpoint, setTestEndpoint] = useState<string>('create')
  const [testOrderId, setTestOrderId] = useState('')
  const [testImage, setTestImage] = useState('')
  const [testResult, setTestResult] = useState<ApiJson | null>(null)
  const selectedWebhookProject = data?.projects.find((project) => project.id === webhookProject)
  const endpoint = endpoints.find((item) => item.id === testEndpoint) ?? endpoints[0]

  async function refresh() {
    const response = await fetch('/api/admin/overview')
    if (response.status === 401) { window.location.assign('/login'); return }
    if (!response.ok) throw new Error('Gagal memuat data workspace.')
    const result: Overview = await response.json()
    setData(result)
    if (!keyProject && result.projects[0]) setKeyProject(result.projects[0].id)
    if (!paymentProject && result.projects[0]) setPaymentProject(result.projects[0].id)
    if (!webhookProject && result.projects[0]) { setWebhookProject(result.projects[0].id); setWebhookUrl(result.projects[0].webhookUrl ?? '') }
  }

  useEffect(() => { refresh().catch((cause) => setError(cause.message)) }, [])

  async function post(url: string, body: object, method = 'POST') {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error ?? 'Request gagal.')
    return result
  }

  async function createProject(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { await post('/api/admin/projects', { name: projectName, slug: projectSlug }); setProjectName(''); setProjectSlug(''); setNotice('Project berhasil dibuat.'); await refresh() }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function createKey(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setRawKey('')
    try { const result = await post('/api/admin/keys', { projectId: keyProject, label: keyLabel }); setRawKey(result.raw); setTestKey(result.raw); setKeyLabel(''); await refresh() }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function revokeKey(id: string) {
    setBusy(true); setError('')
    try { await post('/api/admin/keys', { id }, 'DELETE'); setNotice('API key dinonaktifkan.'); await refresh() }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  function selectWebhookProject(id: string) {
    setWebhookProject(id); setWebhookUrl(data?.projects.find((project) => project.id === id)?.webhookUrl ?? ''); setWebhookSecret('')
  }

  async function saveWebhook(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setWebhookSecret('')
    try {
      const result = await post('/api/admin/projects', { id: webhookProject, webhookUrl }, 'PATCH')
      setWebhookSecret(result.secret ?? '')
      setNotice(result.secret ? 'Webhook disimpan. Salin secret sebelum menutup.' : 'Webhook disimpan.')
      await refresh()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function rotateWebhookSecret() {
    setBusy(true); setError(''); setNotice(''); setWebhookSecret('')
    try {
      const result = await post('/api/admin/projects', { id: webhookProject, rotateSecret: true }, 'PATCH')
      setWebhookSecret(result.secret ?? '')
      setNotice('Secret webhook dirotasi. Salin sekarang.')
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function sendTest(event: FormEvent) {
    event.preventDefault(); setTestBusy(true); setTestError(''); setTestResult(null); setTestImage('')
    try {
      const target = endpoints.find((item) => item.id === testEndpoint) ?? endpoints[0]
      const headers: Record<string, string> = {}
      if (target.auth) headers.Authorization = `Bearer ${testKey}`
      const init: RequestInit = { method: target.method.toUpperCase(), headers }
      if (target.id === 'create') {
        headers['Content-Type'] = 'application/json'
        headers['Idempotency-Key'] = crypto.randomUUID()
        init.body = JSON.stringify({ amount: Number(testAmount), currency: 'IDR', externalReference: testReference || undefined, description: testDescription || undefined })
      }
      const response = await fetch(target.path.replace(':orderId', encodeURIComponent(testOrderId)), init)
      if (target.id === 'qr') {
        if (!response.ok) throw new Error('QR belum tersedia.')
        const blob = await response.blob()
        setTestImage(URL.createObjectURL(blob))
        setTestResult({ contentType: blob.type, bytes: blob.size })
        return
      }
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
      setTestResult(result)
      if (target.id === 'create') await refresh()
    } catch (cause) { setTestError((cause as Error).message) } finally { setTestBusy(false) }
  }

  async function createPayment(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = await post('/api/admin/payments', { projectId: paymentProject, amount: Number(amount), currency: 'IDR', description, externalReference: reference || undefined })
      await navigate({ to: '/pay/$orderId', params: { orderId: result.orderId } })
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function logout() { await post('/api/auth/logout', {}); window.location.assign('/login') }

  return <div className="app-shell">
    <aside className="sidebar"><div><Brand /><div className="side-label">WORKSPACE</div><nav className="side-nav" aria-label="Navigasi utama"><button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><span>◫</span> Overview</button><button className={section === 'create' ? 'active' : ''} onClick={() => setSection('create')}><span>✣</span> Buat Payment</button><button className={section === 'api' ? 'active' : ''} onClick={() => setSection('api')}><span>⌘</span> Project & API</button></nav></div><div className="sidebar-bottom"><div className="sidebar-private"><span className="private-dot" /> Private workspace<br /><small>pay.lydev.id</small></div><button onClick={logout} className="logout">Keluar <span>↗</span></button></div></aside>
    <main className="dashboard-main"><header className="topbar"><div className="breadcrumbs">LYDEV PAY <span>/</span> {section === 'overview' ? 'OVERVIEW' : section === 'create' ? 'CREATE PAYMENT' : 'PROJECT & API'}</div><div className="topbar-right"><span className="env-pill"><i /> SANDBOX</span><span className="avatar">LY</span></div></header>
      <div className="dashboard-content">{section === 'overview' ? <><div className="page-heading"><div><div className="eyebrow">PAYMENT WORKSPACE <span className="eyebrow-line" /></div><h1>Overview<span className="title-period">.</span></h1><p className="muted">Semua pembayaran dan aktivitas project Anda, dalam satu tampilan.</p></div><button className="button button-primary" onClick={() => setSection('create')}>+ Buat payment</button></div>
        <div className="metric-grid"><div className="metric-card"><span className="metric-icon">◫</span><span className="metric-label">TOTAL TRANSAKSI</span><strong>{data?.metrics.total ?? '—'}</strong><small>Seluruh payment tercatat</small></div><div className="metric-card"><span className="metric-icon">✓</span><span className="metric-label">BERHASIL</span><strong>{data?.metrics.paid ?? '—'}</strong><small>Pembayaran selesai</small></div><div className="metric-card"><span className="metric-icon">◷</span><span className="metric-label">MENUNGGU</span><strong>{data?.metrics.pending ?? '—'}</strong><small>Menunggu konfirmasi provider</small></div></div>
        <div className="panel transaction-panel"><div className="panel-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>Transaksi terbaru</h2></div><span className="table-count">{data?.payments.length ?? 0} transaksi</span></div><div className="table-wrap"><table><thead><tr><th>ORDER ID</th><th>PROJECT</th><th>JUMLAH</th><th>STATUS</th><th>WAKTU</th><th /></tr></thead><tbody>{data?.payments.map((payment) => <tr key={payment.orderId}><td className="mono">{payment.orderId}</td><td>{payment.projectName}</td><td className="strong">{money(payment.providerAmount ?? payment.amount)}</td><td><span className={`status-badge status-${payment.status.toLowerCase()}`}>{statusLabel(payment.status)}</span></td><td>{day(payment.createdAt)}</td><td><Link to="/pay/$orderId" params={{ orderId: payment.orderId }} className="table-link">Lihat ↗</Link></td></tr>)}{data && data.payments.length === 0 ? <tr><td colSpan={6} className="empty-table"><div className="empty-symbol">✳</div><strong>Belum ada transaksi</strong><p>Buat payment pertama untuk mulai menguji alur QRIS Anda.</p><button className="button button-outline" onClick={() => setSection('create')}>Buat payment pertama</button></td></tr> : null}</tbody></table></div></div>
        <div className="bottom-cards"><div className="mini-panel"><span className="mini-icon">⌘</span><h3>Project API</h3><p>Hubungkan project Anda dengan endpoint payment yang aman.</p><button onClick={() => setSection('api')}>Kelola project <span>→</span></button></div><div className="mini-panel"><span className="mini-icon">◇</span><h3>Sandbox ready</h3><p>Uji payment QRIS sebelum menghubungkan credential produksi.</p><button onClick={() => setSection('create')}>Coba payment <span>→</span></button></div></div>
      </> : section === 'create' ? <><div className="page-heading"><div><div className="eyebrow">SANDBOX PAYMENT <span className="eyebrow-line" /></div><h1>Buat payment<span className="title-period">.</span></h1><p className="muted">Buat transaksi QRIS untuk menguji alur dari project Anda.</p></div></div><div className="form-layout"><form className="panel form-panel" onSubmit={createPayment}><div className="panel-heading"><div><div className="eyebrow">DETAIL TRANSAKSI</div><h2>Payment baru</h2></div></div><label>Project<select value={paymentProject} onChange={(e) => setPaymentProject(e.target.value)} required><option value="">Pilih project</option>{data?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>Jumlah pembayaran (IDR)<input type="number" min="1" step="1" placeholder="50000" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label>Deskripsi<input placeholder="Contoh: Top up saldo" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} /></label><label>Referensi eksternal <span className="optional">opsional</span><input placeholder="ORDER-001" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} /></label><button className="button button-primary" disabled={busy || !data?.projects.length}>{busy ? 'Membuat...' : 'Buat payment QRIS ↗'}</button>{!data?.projects.length ? <p className="muted">Buat project terlebih dahulu di tab Project & API.</p> : null}</form><div className="info-panel"><div className="info-shape">◇</div><div className="eyebrow">HOW IT WORKS</div><h2>Dari request<br />ke pembayaran.</h2><ol><li>LYDEV membuat order unik dan meneruskan request ke Sumopod Sandbox.</li><li>QRIS ditampilkan di halaman checkout LYDEV Pay.</li><li>Webhook terverifikasi memperbarui status pembayaran.</li></ol></div></div></> : <><div className="page-heading"><div><div className="eyebrow">DEVELOPER SPACE <span className="eyebrow-line" /></div><h1>Project & API<span className="title-period">.</span></h1><p className="muted">Atur project dan kunci untuk memanggil endpoint payment dari server Anda.</p></div></div><div className="api-grid"><form className="panel form-panel" onSubmit={createProject}><div className="panel-heading"><div><div className="eyebrow">01 / PROJECT</div><h2>Tambah project</h2></div></div><label>Nama project<input placeholder="Contoh: Topup App" value={projectName} onChange={(e) => setProjectName(e.target.value)} required /></label><label>Slug<input placeholder="topup-app" value={projectSlug} onChange={(e) => setProjectSlug(e.target.value.toLowerCase())} pattern="[a-z0-9-]{2,40}" required /></label><button className="button button-primary" disabled={busy}>Simpan project ↗</button><div className="project-list">{data?.projects.map((project) => <div key={project.id}><span className="project-avatar">{project.name.slice(0, 2).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.slug}{project.webhookUrl ? ' · webhook aktif' : ''}</small></span><span className="project-active">Aktif</span></div>)}</div></form><form className="panel form-panel" onSubmit={createKey}><div className="panel-heading"><div><div className="eyebrow">02 / ACCESS</div><h2>API key</h2></div></div><label>Project<select value={keyProject} onChange={(e) => setKeyProject(e.target.value)} required><option value="">Pilih project</option>{data?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>Label kunci<input placeholder="Contoh: Backend production" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} maxLength={80} /></label><button className="button button-primary" disabled={busy || !data?.projects.length}>Buat API key ↗</button>{rawKey ? <div className="key-reveal"><strong>Salin sekarang. Kunci ini hanya ditampilkan sekali.</strong><code>{rawKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(rawKey)}>Salin kunci</button></div> : null}<div className="key-list">{data?.keys.map((key) => <div key={key.id}><span><strong>{key.label || 'Tanpa label'}</strong><small className="mono">{key.prefix}••••••</small></span>{key.isActive ? <button type="button" onClick={() => revokeKey(key.id)} disabled={busy}>Nonaktifkan</button> : <small>Nonaktif</small>}</div>)}</div></form><form className="panel form-panel" onSubmit={saveWebhook}><div className="panel-heading"><div><div className="eyebrow">03 / WEBHOOK</div><h2>Notifikasi project</h2></div></div><label>Project<select value={webhookProject} onChange={(e) => selectWebhookProject(e.target.value)} required><option value="">Pilih project</option>{data?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>URL webhook<input placeholder="https://backend-anda.com/hooks/lydev" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} maxLength={2048} /></label><button className="button button-primary" disabled={busy || !data?.projects.length}>Simpan webhook ↗</button><button className="button button-outline" type="button" onClick={rotateWebhookSecret} disabled={busy || !selectedWebhookProject?.webhookUrl}>Rotasi secret</button><p className="muted">Kosongkan URL untuk menonaktifkan. Request ditandatangani HMAC-SHA256.</p>{webhookSecret ? <div className="key-reveal"><strong>Salin secret sekarang. Hanya ditampilkan sekali.</strong><code>{webhookSecret}</code><button type="button" onClick={() => navigator.clipboard.writeText(webhookSecret)}>Salin secret</button></div> : null}</form></div><div className="panel endpoint-panel"><div><div className="eyebrow">TEST ENDPOINTS</div><h2>Endpoint untuk pengujian</h2><p className="muted">Base URL <code className="mono">{data?.baseUrl}</code>. Panggil dari backend project Anda dengan API key. Checkout browser tetap memerlukan login.</p></div><div className="code-lines">{endpoints.map((item) => <button key={item.id} type="button" className={testEndpoint === item.id ? 'active' : ''} onClick={() => { setTestEndpoint(item.id); setTestResult(null); setTestImage(''); setTestError('') }}><span className={`method ${item.method}`}>{item.method.toUpperCase()}</span><code>{data?.baseUrl}{item.path}</code></button>)}</div><p className="code-note">Header payment: <code className="mono">Authorization: Bearer &lt;API_KEY&gt;</code> · <code className="mono">Idempotency-Key: &lt;unik-per-request&gt;</code>. Parameter POST /payments: amount, currency (wajib), externalReference, description, customer (opsional). Ganti <code className="mono">:orderId</code> dengan orderId pembayaran.</p><div className="code-note key-reveal"><strong>API KEY UNTUK UJI</strong>{rawKey ? <code>{rawKey}</code> : <code>lypay-••••••••••••••••••••</code>}{rawKey ? <button type="button" onClick={() => navigator.clipboard.writeText(rawKey)}>Salin kunci</button> : <small className="muted">Buat key di panel 02 / ACCESS — key hanya ditampilkan sekali.</small>}</div><div className="tester-block">{testEndpoint === 'webhook' ? <p className="response-note">Endpoint ini dipanggil oleh Sumopod dengan signature Svix, bukan dari dashboard. Gunakan panel 03 / WEBHOOK untuk mengarahkan hasilnya ke backend Anda.</p> : <form className="tester-form" onSubmit={sendTest}>{endpoint.auth ? <label>API key<input placeholder="lypay-..." value={testKey} onChange={(e) => setTestKey(e.target.value)} required /></label> : null}{endpoint.param ? <label>orderId<input placeholder="LY-..." value={testOrderId} onChange={(e) => setTestOrderId(e.target.value)} required /></label> : null}{endpoint.id === 'create' ? <><label>Nominal (IDR)<input type="number" min="1" step="1" placeholder="10000" value={testAmount} onChange={(e) => setTestAmount(e.target.value)} required /></label><label>Referensi eksternal <span className="optional">opsional</span><input placeholder="ORDER-001" value={testReference} onChange={(e) => setTestReference(e.target.value)} maxLength={100} /></label><label className="full">Deskripsi <span className="optional">opsional</span><input placeholder="Pembayaran uji QRIS" value={testDescription} onChange={(e) => setTestDescription(e.target.value)} maxLength={240} /></label></> : null}<div className="full"><button className="button button-primary" disabled={testBusy}>{testBusy ? 'Mengirim...' : `Kirim ${endpoint.method.toUpperCase()} ${endpoint.path} ↗`}</button></div></form>}{testError ? <p className="form-error" role="alert">{testError}</p> : null}{testImage ? <div className="tester-result"><div className="eyebrow">RESPONS 200</div><div className="tester-qr"><img src={testImage} alt="Respons QR" /><a href={testImage} download={`${testOrderId || 'qr'}.png`}>Buka gambar QR (.png) ↗</a></div></div> : null}{testResult ? <div className="tester-result"><div className="eyebrow">RESPONS</div>{testResult.orderId ? <div className="document-grid"><div><span className="field-label">NO INVOICE (ORDER ID)</span><strong className="mono">{testResult.orderId}</strong></div><div><span className="field-label">STATUS</span><strong>{testResult.status}</strong></div>{testResult.fee !== undefined ? <><div><span className="field-label">NOMINAL DASAR</span><strong>{money(testResult.amount)}</strong></div><div><span className="field-label">FEE</span><strong>{testResult.fee === null ? '—' : money(testResult.fee)}</strong></div><div><span className="field-label">TOTAL DIBAYAR</span><strong>{money(testResult.providerAmount ?? testResult.amount)}</strong></div><div><span className="field-label">KEDALUWARSA</span><strong>{testResult.expiresAt ? day(testResult.expiresAt) : '—'}</strong></div></> : null}</div> : null}{testResult.qrUrl ? <div className="tester-qr"><img src={testResult.qrUrl} alt={`QR ${testResult.orderId}`} /><a href={testResult.qrUrl} download={`${testResult.orderId}.png`}>Buka gambar QR (.png) ↗</a></div> : null}<pre className="tester-json">{JSON.stringify(testResult, null, 2)}</pre></div> : null}</div></div></>}
      {error ? <div className="toast error" role="alert">{error}<button onClick={() => setError('')}>×</button></div> : null}{notice ? <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div> : null}</div>
    </main>
  </div>
}

function statusLabel(status: string) {
  return ({ CREATED: 'Menyiapkan', PENDING: 'Menunggu', PAID: 'Berhasil', FAILED: 'Gagal', EXPIRED: 'Kedaluwarsa', CANCELLED: 'Dibatalkan', REFUNDED: 'Dikembalikan' } as Record<string, string>)[status] ?? status
}
