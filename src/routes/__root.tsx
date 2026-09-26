import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'LYDEV Pay — Payment workspace' },
      { name: 'description', content: 'Workspace pembayaran pribadi LYDEV.' },
      { name: 'theme-color', content: '#6d523e' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/favicon.svg' },
    ],
  }),
  component: () => <Document><Outlet /></Document>,
})

function Document({ children }: { children: ReactNode }) {
  return <html lang="id"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
