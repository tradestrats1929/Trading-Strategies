import { NavLink } from 'react-router-dom'

const SERVICES = [
  { path: '/hello',    label: 'Hello',    api: 'hello' },
  { path: '/txn-cost', label: 'Txn Cost', api: 'txn-cost' },
]

const isLocal = import.meta.env.VITE_HELLO_API_URL?.includes('localhost')
const envPrefix = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
const BASE = isLocal ? null : `https://trading-strategies.duckdns.org${envPrefix}`

export default function Nav() {
  return (
    <nav style={nav}>
      <NavLink to="/" style={({ isActive }) => ({ ...brand, ...(isActive ? active : {}) })}>
        Trading Strategies
      </NavLink>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {SERVICES.map(s => (
          <NavLink
            key={s.path}
            to={s.path}
            style={({ isActive }) => ({ ...link, ...(isActive ? active : {}) })}
          >
            {s.label}
          </NavLink>
        ))}
        {BASE && (
          <span style={{ borderLeft: '1px solid #444', marginLeft: '0.5rem', paddingLeft: '0.5rem', display: 'flex', gap: '0.25rem' }}>
            {SERVICES.map(s => (
              <a key={s.api} href={`${BASE}/api/${s.api}/docs`} target="_blank" rel="noreferrer" style={docsLink}>
                {s.label} API
              </a>
            ))}
          </span>
        )}
      </div>
    </nav>
  )
}

const nav: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.6rem 1.5rem',
  background: '#111',
  color: '#fff',
  fontSize: '0.85rem',
}
const brand: React.CSSProperties = {
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: '1rem',
}
const link: React.CSSProperties = {
  color: '#ccc',
  textDecoration: 'none',
  padding: '0.3rem 0.6rem',
  borderRadius: '4px',
}
const active: React.CSSProperties = {
  color: '#fff',
  background: '#333',
}
const docsLink: React.CSSProperties = {
  color: '#888',
  textDecoration: 'none',
  padding: '0.3rem 0.5rem',
  fontSize: '0.75rem',
  border: '1px solid #333',
  borderRadius: '4px',
}
