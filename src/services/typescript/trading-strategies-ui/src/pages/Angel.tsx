import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_ANGEL_API_URL ?? 'http://localhost:8006'

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  logged_in: boolean
  ws_connected: boolean
  login_time: string | null
  next_relogin: string | null
  ws_last_error: string | null
  instrument_count: number
  subscribed_count: number
}

interface Instrument {
  token: string
  symbol: string
  strike: number
  expiry: string
  expiry_date: string | null
  option_type: string
  lot_size: number
  tick_size: number
}

interface DepthLevel {
  price: number
  quantity: number
  num_orders?: number
}

interface Tick {
  token: string
  last_traded_price?: number
  received_at?: string
  best_5_buy_data?: DepthLevel[]
  best_5_sell_data?: DepthLevel[]
  volume_trade_for_the_day?: number
  open_price_of_the_day?: number
  high_price_of_the_day?: number
  low_price_of_the_day?: number
  closed_price?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (p: number | undefined) =>
  p != null ? (p / 100).toFixed(2) : '—'

const fmtTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
    : '—'

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
    : '—'

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.55rem',
      borderRadius: 999,
      fontSize: '0.75rem',
      fontWeight: 600,
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#15803d' : '#dc2626',
    }}>
      {ok ? yes : no}
    </span>
  )
}

// ── Market depth card ─────────────────────────────────────────────────────────

function DepthCard({ token, tick, symbol, onUnsub }: {
  token: string
  tick: Tick | null
  symbol: string
  onUnsub: () => void
}) {
  const ltp = tick?.last_traded_price
  const buys = tick?.best_5_buy_data ?? []
  const sells = tick?.best_5_sell_data ?? []
  const levels = Math.max(buys.length, sells.length, 5)

  return (
    <div style={depthCardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>{symbol || token}</div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.1rem' }}>token {token}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace', color: '#111' }}>
            {ltp != null ? `₹${fmtPrice(ltp)}` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{fmtTime(tick?.received_at)} IST</div>
        </div>
      </div>

      {/* OHLC row */}
      {tick && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem', marginBottom: '0.6rem', fontSize: '0.72rem' }}>
          {[
            ['Open', tick.open_price_of_the_day],
            ['High', tick.high_price_of_the_day],
            ['Low', tick.low_price_of_the_day],
            ['Close', tick.closed_price],
          ].map(([label, val]) => (
            <div key={label as string} style={{ background: '#f9fafb', borderRadius: 4, padding: '0.25rem 0.4rem' }}>
              <div style={{ color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontFamily: 'monospace', color: '#374151' }}>{fmtPrice(val as number | undefined)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Depth table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr>
            <th style={{ ...dth, textAlign: 'right', color: '#15803d' }}>Qty</th>
            <th style={{ ...dth, textAlign: 'right', color: '#15803d' }}>Orders</th>
            <th style={{ ...dth, textAlign: 'right', color: '#15803d' }}>Bid</th>
            <th style={{ ...dth, color: '#6b7280', textAlign: 'center', width: 16 }}></th>
            <th style={{ ...dth, color: '#dc2626' }}>Ask</th>
            <th style={{ ...dth, color: '#dc2626' }}>Orders</th>
            <th style={{ ...dth, color: '#dc2626' }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: levels }).map((_, i) => {
            const b = buys[i]
            const s = sells[i]
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ ...dtd, textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>{b?.quantity ?? '—'}</td>
                <td style={{ ...dtd, textAlign: 'right', color: '#15803d', fontFamily: 'monospace' }}>{b?.num_orders ?? '—'}</td>
                <td style={{ ...dtd, textAlign: 'right', color: '#15803d', fontFamily: 'monospace', fontWeight: 600 }}>{b ? fmtPrice(b.price) : '—'}</td>
                <td style={{ ...dtd, textAlign: 'center', color: '#d1d5db', fontSize: '0.6rem' }}>│</td>
                <td style={{ ...dtd, color: '#dc2626', fontFamily: 'monospace', fontWeight: 600 }}>{s ? fmtPrice(s.price) : '—'}</td>
                <td style={{ ...dtd, color: '#dc2626', fontFamily: 'monospace' }}>{s?.num_orders ?? '—'}</td>
                <td style={{ ...dtd, color: '#dc2626', fontFamily: 'monospace' }}>{s?.quantity ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Volume */}
      {tick?.volume_trade_for_the_day != null && (
        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.5rem', textAlign: 'right' }}>
          Vol: {tick.volume_trade_for_the_day.toLocaleString('en-IN')}
        </div>
      )}

      <button onClick={onUnsub} style={unsubBtn}>Unsubscribe</button>
    </div>
  )
}

// ── Status card ───────────────────────────────────────────────────────────────

function StatusCard() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/health`)
        .then(r => r.json())
        .then(d => { setHealth(d); setError(null) })
        .catch(e => setError(String(e)))
    fetch_()
    const t = setInterval(fetch_, 10_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Service Status</h2>
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
      {health ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
          <Stat label="Login"><Badge ok={health.logged_in} yes="● Logged in" no="○ Not logged in" /></Stat>
          <Stat label="WebSocket"><Badge ok={health.ws_connected} yes="● Connected" no="○ Reconnecting" /></Stat>
          <Stat label="Instruments loaded"><span style={monoText}>{health.instrument_count}</span></Stat>
          <Stat label="Subscribed tokens"><span style={monoText}>{health.subscribed_count}</span></Stat>
          <Stat label="Login time"><span style={dimText}>{fmtDateTime(health.login_time)}</span></Stat>
          <Stat label="Next re-login"><span style={dimText}>{fmtDateTime(health.next_relogin)}</span></Stat>
          {health.ws_last_error && (
            <Stat label="Last error"><span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{health.ws_last_error}</span></Stat>
          )}
        </div>
      ) : (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Loading…</p>
      )}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
      {children}
    </div>
  )
}

// ── Instrument browser ────────────────────────────────────────────────────────

function InstrumentBrowser({ subscribedTokens, onSubscribe }: {
  subscribedTokens: Set<string>
  onSubscribe: (token: string, symbol: string) => void
}) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [optType, setOptType] = useState<'' | 'CE' | 'PE'>('')
  const [expiry, setExpiry] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [subscribing, setSubscribing] = useState<Set<string>>(new Set())

  const expiries = [...new Set(instruments.map(i => i.expiry))].sort()

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ active_only: String(activeOnly) })
    if (optType) params.set('option_type', optType)
    if (expiry) params.set('expiry', expiry)
    fetch(`${API}/instruments?${params}`)
      .then(r => r.json())
      .then(d => { setInstruments(d); setExpiry('') })
      .finally(() => setLoading(false))
  }, [optType, activeOnly])

  const filtered = search
    ? instruments.filter(i =>
        i.symbol.toLowerCase().includes(search.toLowerCase()) ||
        String(Math.round(i.strike)).includes(search)
      )
    : expiry ? instruments.filter(i => i.expiry === expiry) : instruments

  const handleSubscribe = async (token: string, symbol: string) => {
    setSubscribing(prev => new Set(prev).add(token))
    try {
      await fetch(`${API}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [token] }),
      })
      onSubscribe(token, symbol)
    } finally {
      setSubscribing(prev => { const s = new Set(prev); s.delete(token); return s })
    }
  }

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Instruments — Nifty Index Options</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <input
          placeholder="Search symbol or strike…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={optType} onChange={e => { setOptType(e.target.value as '' | 'CE' | 'PE'); setExpiry('') }} style={inputStyle}>
          <option value="">All types</option>
          <option value="CE">CE</option>
          <option value="PE">PE</option>
        </select>
        <select value={expiry} onChange={e => setExpiry(e.target.value)} style={inputStyle}>
          <option value="">All expiries</option>
          {expiries.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
          />
          Active only
        </label>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${filtered.length} instruments`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
            <tr>
              <th style={th}>Token</th>
              <th style={th}>Symbol</th>
              <th style={{ ...th, textAlign: 'right' }}>Strike</th>
              <th style={th}>Expiry</th>
              <th style={{ ...th, textAlign: 'center' }}>Type</th>
              <th style={{ ...th, textAlign: 'right' }}>Lot</th>
              <th style={{ ...th, textAlign: 'right' }}>Tick</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map(i => {
              const isSub = subscribedTokens.has(i.token)
              return (
                <tr key={i.token} style={{ borderBottom: '1px solid #f3f4f6', background: isSub ? '#f0fdf4' : undefined }}>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#9ca3af', fontSize: '0.72rem' }}>{i.token}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 500 }}>{i.symbol}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{i.strike.toFixed(2)}</td>
                  <td style={{ ...td }}>{i.expiry}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: i.option_type === 'CE' ? '#2563eb' : '#dc2626' }}>{i.option_type}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{i.lot_size}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{i.tick_size}</td>
                  <td style={{ ...td }}>
                    {isSub ? (
                      <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>● Subscribed</span>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(i.token, i.symbol)}
                        disabled={subscribing.has(i.token)}
                        style={subBtn}
                      >
                        {subscribing.has(i.token) ? '…' : 'Subscribe'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', padding: '0.5rem 0' }}>
            Showing 300 of {filtered.length}. Use search or filters to narrow down.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Live stream section ───────────────────────────────────────────────────────

function LiveStream({ subscribedTokens, symbolMap, onUnsub }: {
  subscribedTokens: Set<string>
  symbolMap: Map<string, string>
  onUnsub: (token: string) => void
}) {
  const [ticks, setTicks] = useState<Map<string, Tick>>(new Map())
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/stream`)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      const tick: Tick = JSON.parse(e.data)
      setTicks(prev => new Map(prev).set(tick.token, tick))
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

  const handleUnsub = async (token: string) => {
    await fetch(`${API}/subscriptions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: [token] }),
    })
    onUnsub(token)
    setTicks(prev => { const m = new Map(prev); m.delete(token); return m })
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h2 style={{ ...sectionTitle, margin: 0 }}>Live Stream</h2>
        <Badge ok={connected} yes="● SSE live" no="○ Reconnecting" />
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {subscribedTokens.size === 0 ? 'No subscriptions — subscribe from Instruments above' : `${subscribedTokens.size} token${subscribedTokens.size !== 1 ? 's' : ''}`}
        </span>
      </div>

      {subscribedTokens.size === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Subscribe to instruments above to see live depth here.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
          {[...subscribedTokens].map(token => (
            <DepthCard
              key={token}
              token={token}
              tick={ticks.get(token) ?? null}
              symbol={symbolMap.get(token) ?? ''}
              onUnsub={() => handleUnsub(token)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Snapshot section ──────────────────────────────────────────────────────────

function Snapshot({ subscribedTokens, symbolMap }: {
  subscribedTokens: Set<string>
  symbolMap: Map<string, string>
}) {
  const [ticks, setTicks] = useState<Map<string, Tick>>(new Map())
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (subscribedTokens.size === 0) return
    setLoading(true)
    try {
      const tokens = [...subscribedTokens].join(',')
      const r = await fetch(`${API}/quotes?tokens=${encodeURIComponent(tokens)}`)
      const data: Record<string, Tick | null> = await r.json()
      const m = new Map<string, Tick>()
      for (const [token, tick] of Object.entries(data)) {
        if (tick) m.set(token, tick)
      }
      setTicks(m)
      setFetchedAt(new Date().toISOString())
    } finally {
      setLoading(false)
    }
  }, [subscribedTokens])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h2 style={{ ...sectionTitle, margin: 0 }}>Snapshot</h2>
        <button onClick={refresh} disabled={loading || subscribedTokens.size === 0} style={refreshBtn}>
          {loading ? 'Fetching…' : '↻ Refresh'}
        </button>
        {fetchedAt && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            As of {fmtTime(fetchedAt)} IST
          </span>
        )}
      </div>

      {subscribedTokens.size === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Subscribe to instruments first, then click Refresh.</p>
      ) : ticks.size === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Click Refresh to fetch the latest cached values.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
          {[...ticks.entries()].map(([token, tick]) => (
            <DepthCard
              key={token}
              token={token}
              tick={tick}
              symbol={symbolMap.get(token) ?? ''}
              onUnsub={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Angel() {
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())
  const [symbolMap, setSymbolMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch(`${API}/subscriptions`)
      .then(r => r.json())
      .then((d: { tokens: string[] }) => setSubscribed(new Set(d.tokens)))
      .catch(() => {})
  }, [])

  const handleSubscribe = (token: string, symbol: string) => {
    setSubscribed(prev => new Set(prev).add(token))
    setSymbolMap(prev => new Map(prev).set(token, symbol))
  }

  const handleUnsubscribe = (token: string) => {
    setSubscribed(prev => { const s = new Set(prev); s.delete(token); return s })
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 1.25rem', fontSize: '1.4rem' }}>Angel One</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <StatusCard />
        <InstrumentBrowser subscribedTokens={subscribed} onSubscribe={handleSubscribe} />
        <LiveStream subscribedTokens={subscribed} symbolMap={symbolMap} onUnsub={handleUnsubscribe} />
        <Snapshot subscribedTokens={subscribed} symbolMap={symbolMap} />
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

const sectionTitle: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '1rem',
  fontWeight: 700,
}

const monoText: React.CSSProperties = {
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
  minWidth: 150,
  background: '#fff',
}

const subBtn: React.CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#f9fafb',
  color: '#374151',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const unsubBtn: React.CSSProperties = {
  marginTop: '0.6rem',
  width: '100%',
  padding: '0.3rem',
  fontSize: '0.75rem',
  border: '1px solid #fecaca',
  borderRadius: 4,
  background: '#fef2f2',
  color: '#dc2626',
  cursor: 'pointer',
}

const refreshBtn: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  fontSize: '0.8rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#f9fafb',
  color: '#374151',
  cursor: 'pointer',
  fontWeight: 600,
}

const depthCardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '0.75rem',
  background: '#fafafa',
}

const th: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  color: '#374151',
}

const dth: React.CSSProperties = {
  padding: '0.2rem 0.4rem',
  fontWeight: 600,
  fontSize: '0.7rem',
  borderBottom: '1px solid #e5e7eb',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const dtd: React.CSSProperties = {
  padding: '0.25rem 0.4rem',
  fontSize: '0.78rem',
}
