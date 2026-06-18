import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface HelloResponse {
  message: string
  env: string
}

export default function App() {
  const [data, setData] = useState<HelloResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/hello?name=Trading+Strategies`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HelloResponse>
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Trading Strategies</h1>
      {error && <p style={{ color: 'red' }}>API error: {error}</p>}
      {data && <p>{data.message}</p>}
      {!data && !error && <p>Loading…</p>}
      <p style={{ color: 'grey', fontSize: '0.8rem' }}>
        API: {API_URL}
      </p>
    </main>
  )
}
