import { Link } from 'react-router-dom'


const isLocal = import.meta.env.VITE_HELLO_API_URL?.includes('localhost')
const BASE = isLocal ? null : 'https://trading-strategies.duckdns.org'

const SERVICES = [
  {
    path: '/hello',
    label: 'Hello',
    api: 'hello',
    description: 'Simple greeting service — verifies the stack is alive.',
    color: '#2563eb',
  },
  {
    path: '/txn-cost',
    label: 'Transaction Cost',
    api: 'txn-cost',
    description: 'Indian equity & F&O cost calculator — Zerodha rates, April 2026.',
    color: '#9333ea',
  },
]

export default function Landing() {
  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Trading Strategies</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Select a service below.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {SERVICES.map(s => (
          <div key={s.path} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: s.color, height: '4px' }} />
            <div style={{ padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{s.label}</h2>
              <p style={{ color: '#555', fontSize: '0.875rem', margin: '0 0 1rem' }}>{s.description}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link to={s.path} style={{ ...btn, background: s.color }}>Open UI</Link>
                {BASE && (
                  <a
                    href={`${BASE}/api/${s.api}/docs`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...btn, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}
                  >
                    API Docs
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!BASE && (
        <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#999' }}>
          Running locally — API Docs links appear in production.
        </p>
      )}
    </main>
  )
}

const btn: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.4rem 0.9rem',
  borderRadius: '4px',
  textDecoration: 'none',
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
}
