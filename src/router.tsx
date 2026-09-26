import { Link, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function NotFoundPage() {
  return <div className="checkout-shell"><main className="checkout-main"><div className="checkout-title"><div className="eyebrow">ERROR 404 <span className="eyebrow-line" /></div><h1>Halaman tidak ditemukan<span className="title-period">.</span></h1><p className="muted">Alamat yang Anda buka tidak ada di LYDEV Pay.</p></div><div className="checkout-card"><div className="success-area"><div className="terminal-mark">?</div><h2>Tidak ada apa-apa di sini</h2><p>Periksa kembali tautan Anda. Situs ini hanya menyediakan halaman checkout pembayaran dan area operator.</p><Link to="/login" className="button button-primary">Masuk sebagai operator ↗</Link></div></div></main></div>
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFoundPage,
  })
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
