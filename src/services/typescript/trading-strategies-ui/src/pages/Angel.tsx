import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_ANGEL_API_URL ?? 'http://localhost:8006'

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  logged_in: boolean
  ws_connected: boolean
  login_time: string | null
  next_relogin: string | null
  ws_last_error: string | null
  instruments_loaded: number
  subscriptions: number
}

interface Instrument {
  token: string
  symbol: string
  strike: number
  expiry: string
  option_type: string
  lot_size: number
}

interface DepthEntry {
  price: number
  quantity: number
  orders: number
}

interface Tick {
  token: string
  last_traded_price?: number
  ltp?: number
  best_5_buy_data?: DepthEntry[]
  best_5_sell_data?: DepthEntry[]
  volume_trade_for_the_day?: number
}

interface RowData {
  token: string
  symbol: string
  ltp: number | null
  bestBid: DepthEntry | null
  bestAsk: DepthEntry | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '—'

const badge = (ok: boolean, yesLabel: string, noLabel: string) => (
  <span style={{
    display: 'inline-block',
    padding: '0.15rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: 600,
    background: ok ? '#dcfce7' : '#fee2e2',
    color: ok ? '#15803d' : '#dc2626',
  }}>
    {ok ? yesLabel : noLabel}
  </span>
)

// ── Status card ───────────────────────────────────────────────────────────────

function StatusCard() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    const fetch_ = () =>
      fetch(`${API}/health`)
        .then(r => r.json())
        .then(d => { setHealth(d); setError(null) })
        .catch(e => setError(String(e)))
    fetch_()
    timer = setInterval(fetch_, 10_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Service Status</h2>
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
      {health ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <StatItem label="Login">{badge(health.logged_in, '● Logged in', '○ Not logged in')}</StatItem>
          <StatItem label="WebSocket">{badge(health.ws_connected, '● Connected', '○ Reconnecting')}</StatItem>
          <StatItem label="Instruments loaded"><span style={mono}>{health.instruments_loaded}</span></StatItem>
          <StatItem label="Subscribed tokens"><span style={mono}>{health.subscriptions}</span></StatItem>
          <StatItem label="Login time"><span style={dimText}>{fmtTime(health.login_time)}</span></StatItem>
          <StatItem label="Next re-login"><span style={dimText}>{fmtTime(health.next_relogin)}</span></StatItem>
          {health.ws_last_error && (
            <StatItem label="Last WS error"><span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{health.ws_last_error}</span></StatItem>
          )}
        </div>
      ) : (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Loading…</p>
      )}
    </div>
  )
}

function StatItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
      {children}
    </div>
  )
}

// ── Instrument browser ────────────────────────────────────────────────────────

function InstrumentBrowser({ onSubscribe }: { onSubscribe: (tokens: string[]) => void }) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [optType, setOptType] = useState<'' | 'CE' | 'PE'>('')
  const [expiry, setExpiry] = useState('')
  const [subscribing, setSubscribing] = useState<Set<string>>(new Set())

  const expiries = [...new Set(instruments.map(i => i.expiry))].sort()

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (optType) params.set('option_type', optType)
    if (expiry) params.set('expiry', expiry)
    fetch(`${API}/instruments?${params}`)
      .then(r => r.json())
      .then(d => setInstruments(d))
      .finally(() => setLoading(false))
  }, [optType, expiry])

  const filtered = query
    ? instruments.filter(i =>
        i.symbol.toLowerCase().includes(query.toLowerCase()) ||
        String(i.strike).includes(query)
      )
    : instruments

  const handleSubscribe = async (token: string) => {
    setSubscribing(prev => new Set(prev).add(token))
    try {
      await fetch(`${API}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [token] }),
      })
      onSubscribe([token])
    } finally {
      setSubscribing(prev => { const s = new Set(prev); s.delete(token); return s })
    }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Instrument Browser</h2>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          placeholder="Search symbol or strike…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={inputStyle}
        />
        <select value={optType} onChange={e => setOptType(e.target.value as '' | 'CE' | 'PE')} style={inputStyle}>
          <option value="">All types</option>
          <option value="CE">CE</option>
          <option value="PE">PE</option>
        </select>
        <select value={expiry} onChange={e => setExpiry(e.target.value)} style={inputStyle}>
          <option value="">All expiries</option>
          {expiries.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Loading instruments…</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
              <tr>
                <th style={th}>Token</th>
                <th style={th}>Symbol</th>
                <th style={{ ...th, textAlign: 'right' }}>Strike</th>
                <th style={th}>Expiry</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: 'right' }}>Lot</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(i => (
                <tr key={i.token} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#9ca3af' }}>{i.token}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{i.symbol}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{i.strike.toFixed(2)}</td>
                  <td style={td}>{i.expiry}</td>
                  <td style={{ ...td, fontWeight: 600, color: i.option_type === 'CE' ? '#2563eb' : '#dc2626' }}>{i.option_type}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{i.lot_size}</td>
                  <td style={{ ...td }}>
                    <button
                      onClick={() => handleSubscribe(i.token)}
                      disabled={subscribing.has(i.token)}
                      style={subBtn}
                    >
                      {subscribing.has(i.token) ? '…' : 'Subscribe'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', padding: '0.5rem' }}>
              Showing first 200 of {filtered.length} results. Refine the search to see more.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Live data table ───────────────────────────────────────────────────────────

function LiveDataTable({ subscribedTokens, onUnsubscribe }: {
  subscribedTokens: Set<string>
  onUnsubscribe: (token: string) => void
}) {
  const [rows, setRows] = useState<Map<string, RowData>>(new Map())
  const [symbolMap, setSymbolMap] = useState<Map<string, string>>(new Map())
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  // Keep a symbol lookup so ticks can be labelled even if instruments aren't re-fetched
  useEffect(() => {
    if (subscribedTokens.size === 0) return
    fetch(`${API}/instruments`)
      .then(r => r.json())
      .then((insts: Instrument[]) => {
        setSymbolMap(prev => {
          const next = new Map(prev)
          for (const i of insts) next.set(i.token, i.symbol)
          return next
        })
      })
      .catch(() => {})
  }, [subscribedTokens.size])

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/stream`)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      const tick: Tick = JSON.parse(e.data)
      const token = tick.token
      const ltp = tick.last_traded_price ?? tick.ltp ?? null
      const bestBid = tick.best_5_buy_data?.[0] ?? null
      const bestAsk = tick.best_5_sell_data?.[0] ?? null
      setRows(prev => {
        const next = new Map(prev)
        const existing = next.get(token) ?? { token, symbol: '', ltp: null, bestBid: null, bestAsk: null }
        next.set(token, { ...existing, ltp, bestBid, bestAsk })
        return next
      })
    }
    es.onerror = () => {
      setConnected(false)
      es.close()
      setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => esRef.current?.close()
  }, [connect])

  const handleUnsubscribe = async (token: string) => {
    await fetch(`${API}/subscriptions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: [token] }),
    })
    onUnsubscribe(token)
    setRows(prev => { const next = new Map(prev); next.delete(token); return next })
  }

  if (subscribedTokens.size === 0) {
    return (
      <div style={card}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Live Data</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Subscribe to instruments above to see live ticks here.</p>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Live Data</h2>
        {badge(connected, '● SSE live', '○ Reconnecting')}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{subscribedTokens.size} token{subscribedTokens.size !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th}>Symbol</th>
              <th style={{ ...th, textAlign: 'right' }}>LTP</th>
              <th style={{ ...th, textAlign: 'right' }}>Best Bid</th>
              <th style={{ ...th, textAlign: 'right' }}>Bid Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Best Ask</th>
              <th style={{ ...th, textAlign: 'right' }}>Ask Qty</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {[...subscribedTokens].map(token => {
              const row = rows.get(token)
              const symbol = row?.symbol || symbolMap.get(token) || token
              return (
                <tr key={token} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{symbol}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {row?.ltp != null ? row.ltp.toFixed(2) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>
                    {row?.bestBid ? row.bestBid.price.toFixed(2) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>
                    {row?.bestBid ? row.bestBid.quantity : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#dc2626', fontFamily: 'monospace' }}>
                    {row?.bestAsk ? row.bestAsk.price.toFixed(2) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#dc2626', fontFamily: 'monospace' }}>
                    {row?.bestAsk ? row.bestAsk.quantity : '—'}
                  </td>
                  <td style={td}>
                    <button onClick={() => handleUnsubscribe(token)} style={{ ...subBtn, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                      Unsub
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Angel() {
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())

  // Load current subscriptions from server on mount
  useEffect(() => {
    fetch(`${API}/subscriptions`)
      .then(r => r.json())
      .then((d: { tokens: string[] }) => setSubscribed(new Set(d.tokens)))
      .catch(() => {})
  }, [])

  const handleSubscribe = (tokens: string[]) => {
    setSubscribed(prev => {
      const next = new Set(prev)
      tokens.forEach(t => next.add(t))
      return next
    })
  }

  const handleUnsubscribe = (token: string) => {
    setSubscribed(prev => {
      const next = new Set(prev)
      next.delete(token)
      return next
    })
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 1.25rem', fontSize: '1.4rem' }}>Angel One</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <StatusCard />
        <InstrumentBrowser onSubscribe={handleSubscribe} />
        <LiveDataTable subscribedTokens={subscribed} onUnsubscribe={handleUnsubscribe} />
      </div>
    </main>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '1rem',
  background: '#fff',
}

const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.85rem',
  color: '#111',
}

const dimText: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#374151',
}

const inputStyle: React.CSSProperties = {
  padding: '0.35rem 0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: '0.8rem',
  minWidth: 160,
}

const subBtn: React.CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#f9fafb',
  color: '#374151',
  cursor: 'pointer',
}

const th: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  color: '#374151',
}
