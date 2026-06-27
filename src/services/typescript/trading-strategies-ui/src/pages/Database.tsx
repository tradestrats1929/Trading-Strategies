import { useState, useEffect, FormEvent } from 'react'

const API = import.meta.env.VITE_DB_API_URL ?? 'http://localhost:8001'

interface Item { id: number; name: string; value: number }

export default function Database() {
  const [items, setItems] = useState<Item[]>([])
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () =>
    fetch(`${API}/items`)
      .then(r => r.json() as Promise<Item[]>)
      .then(setItems)
      .catch(() => setError('Failed to load items'))
      .finally(() => setLoading(false))

  useEffect(() => { void load() }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const r = await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: parseFloat(value) }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setName(''); setValue('')
      void load()
    } catch {
      setError('Failed to create item')
    }
  }

  return (
    <main style={page}>
      <h1>Database</h1>

      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input placeholder="Name" required value={name} onChange={e => setName(e.target.value)} style={inp} />
        <input placeholder="Value" type="number" step="0.01" required value={value} onChange={e => setValue(e.target.value)} style={inp} />
        <button type="submit" style={btn}>Add item</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p style={{ color: '#888' }}>Loading…</p>}

      {!loading && items.length === 0 && <p style={{ color: '#888' }}>No items yet.</p>}

      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {['ID', 'Name', 'Value'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td style={td}>{i.id}</td>
                <td style={td}>{i.name}</td>
                <td style={td}>{i.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={hint}>API: <code>{API}</code></p>
    </main>
  )
}

const page: React.CSSProperties = { padding: '2rem', maxWidth: '680px', margin: '0 auto' }
const hint: React.CSSProperties = { color: '#bbb', fontSize: '0.75rem', marginTop: '2rem' }
const inp: React.CSSProperties = { padding: '0.4rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' }
const btn: React.CSSProperties = { padding: '0.4rem 1rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }
const th: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.85rem', borderBottom: '2px solid #ddd' }
const td: React.CSSProperties = { padding: '0.4rem 0.75rem', borderBottom: '1px solid #eee', fontSize: '0.9rem' }
