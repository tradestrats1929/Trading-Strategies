import { useState, useEffect, FormEvent } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

interface Item {
  id: number
  name: string
  value: number
}

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchItems = () =>
    fetch(`${API_URL}/items`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Item[]>
      })
      .then(setItems)
      .catch((err: Error) => setError(err.message))

  useEffect(() => { fetchItems() }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const r = await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: parseFloat(value) }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setName('')
      setValue('')
      await fetchItems()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px' }}>
      <h1>DB Test</h1>
      <p style={{ color: 'grey', fontSize: '0.8rem' }}>API: {API_URL}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ flex: 1, padding: '0.4rem' }}
        />
        <input
          placeholder="Value"
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          style={{ width: '100px', padding: '0.4rem' }}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {items.length === 0 && !error && <p style={{ color: 'grey' }}>No items yet.</p>}

      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Name</th>
              <th style={th}>Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={td}>{item.id}</td>
                <td style={td}>{item.name}</td>
                <td style={td}>{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '2px solid #ccc',
  padding: '0.4rem',
}
const td: React.CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: '0.4rem',
}
