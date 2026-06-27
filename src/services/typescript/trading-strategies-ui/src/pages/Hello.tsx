import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_HELLO_API_URL ?? 'http://localhost:8000'

export default function Hello() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/hello?name=Trading+Strategies`)
      .then(r => r.json() as Promise<{ message: string }>)
      .then(d => setMessage(d.message))
      .catch(() => setError('Failed to fetch'))
  }, [])

  return (
    <main style={page}>
      <h1>Hello Service</h1>
      {error   && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ fontSize: '1.25rem' }}>{message}</p>}
      {!message && !error && <p style={{ color: '#888' }}>Loading…</p>}
      <p style={hint}>API: <code>{API}</code></p>
    </main>
  )
}

const page: React.CSSProperties = { padding: '2rem', maxWidth: '600px', margin: '0 auto' }
const hint: React.CSSProperties = { color: '#bbb', fontSize: '0.75rem', marginTop: '2rem' }
