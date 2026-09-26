import { Link } from '@tanstack/react-router'

export function Brand({ to = '/dashboard' }: { to?: '/dashboard' | '/' }) {
  return <Link to={to} className="brand" aria-label="LYDEV Pay"><span className="brand-mark">L<span className="brand-dot">.</span></span><span>lydev<span className="brand-light">pay</span></span></Link>
}
