import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface HelloResponse {
  message: string
}

export default function App() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/hello?name=Trading+Strategies`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HelloResponse>
      })
      .then((data) => setMessage(data.message))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Trading Strategies</h1>
      {error && <p style={{ color: 'red' }}>API error: {error}</p>}
      {message && <p>{message}</p>}
      {!message && !error && <p>Loading…</p>}
    </main>
  )
}
