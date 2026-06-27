import { useState, FormEvent } from 'react'

const API = import.meta.env.VITE_TXN_COST_API_URL ?? 'http://localhost:8002'

type InstrumentType = 'equity' | 'equity_futures' | 'index_futures' | 'equity_options' | 'index_options'
type Exchange = 'NSE' | 'BSE'
type Direction = 'buy' | 'sell'
type TradeType = 'delivery' | 'intraday' | 'regular' | 'exercise'
type OptionType = 'call' | 'put'

interface TradeForm {
  instrument: InstrumentType; exchange: Exchange; direction: Direction
  price: string; quantity: string; trade_type: TradeType
  option_type: OptionType; strike: string; spot: string
}

interface CostBreakdown {
  brokerage: number; stt: number; stamp_duty: number; exchange_tc: number
  sebi_fee: number; gst: number; ipft: number; dp_charges: number
  total: number; notes: string[]
}

const isOptions = (i: InstrumentType) => i === 'equity_options' || i === 'index_options'
const isEquity  = (i: InstrumentType) => i === 'equity'
const isFutures = (i: InstrumentType) => i === 'equity_futures' || i === 'index_futures'

function tradeTypeOptions(instrument: InstrumentType): { value: TradeType; label: string }[] {
  if (isEquity(instrument))  return [{ value: 'delivery', label: 'Delivery' }, { value: 'intraday', label: 'Intraday' }]
  if (isFutures(instrument)) return [{ value: 'regular', label: 'Regular' }]
  return [{ value: 'regular', label: 'Regular square-off' }, { value: 'exercise', label: 'Exercise / Expiry' }]
}

const defaultForm = (): TradeForm => ({
  instrument: 'index_options', exchange: 'NSE', direction: 'sell',
  price: '', quantity: '', trade_type: 'regular',
  option_type: 'call', strike: '', spot: '',
})

const fmt = (n: number) => `₹${n.toFixed(2)}`

const ROWS: { key: keyof CostBreakdown; label: string; hint: string }[] = [
  { key: 'brokerage',   label: 'Brokerage',                    hint: 'Zerodha: ₹0 delivery, ₹20 flat F&O, min(₹20, 0.03%) intraday' },
  { key: 'stt',         label: 'STT',                          hint: 'Securities Transaction Tax — rates effective April 2026' },
  { key: 'stamp_duty',  label: 'Stamp Duty',                   hint: 'Buy side only — unified national rate since July 2020' },
  { key: 'exchange_tc', label: 'Exchange Transaction Charges',  hint: 'NSE/BSE levy on turnover or premium' },
  { key: 'sebi_fee',    label: 'SEBI Turnover Fee',            hint: '₹10 per crore — both sides' },
  { key: 'gst',         label: 'GST (18%)',                    hint: 'On brokerage + exchange TC + SEBI fee' },
  { key: 'ipft',        label: 'IPFT',                         hint: 'NSE only — ₹0.01/crore' },
  { key: 'dp_charges',  label: 'DP Charges',                   hint: '₹15.34/scrip — equity delivery sell only' },
]

export default function TxnCost() {
  const [form, setForm] = useState<TradeForm>(defaultForm())
  const [result, setResult] = useState<CostBreakdown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const set = (field: keyof TradeForm) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const value = e.target.value
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'instrument') next.trade_type = tradeTypeOptions(value as InstrumentType)[0].value
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setResult(null)
    const body: Record<string, unknown> = {
      instrument: form.instrument, exchange: form.exchange, direction: form.direction,
      price: parseFloat(form.price), quantity: parseInt(form.quantity, 10), trade_type: form.trade_type,
    }
    if (isOptions(form.instrument)) {
      body.option_type = form.option_type
      if (form.trade_type === 'exercise') { body.strike = parseFloat(form.strike); body.spot = parseFloat(form.spot) }
    }
    try {
      const r = await fetch(`${API}/calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const err = await r.json() as { detail: string }; throw new Error(err.detail ?? `HTTP ${r.status}`) }
      setResult(await r.json() as CostBreakdown)
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }

  const typeOpts = tradeTypeOptions(form.instrument)
  const showOptionFields  = isOptions(form.instrument)
  const showExerciseFields = showOptionFields && form.trade_type === 'exercise'

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Transaction Cost Calculator</h1>
      <p style={{ color: 'grey', fontSize: '0.8rem', marginTop: 0 }}>Zerodha / NSE·BSE · April 2026 rates</p>

      <form onSubmit={handleSubmit}>
        <div style={grid}>
          <label style={lbl}>Instrument
            <select value={form.instrument} onChange={set('instrument')} style={inp}>
              <option value="equity">Equity (Cash)</option>
              <option value="equity_futures">Equity Futures</option>
              <option value="index_futures">Index Futures</option>
              <option value="equity_options">Equity Options</option>
              <option value="index_options">Index Options</option>
            </select>
          </label>
          <label style={lbl}>Exchange
            <select value={form.exchange} onChange={set('exchange')} style={inp}>
              <option value="NSE">NSE</option><option value="BSE">BSE</option>
            </select>
          </label>
          <label style={lbl}>Direction
            <select value={form.direction} onChange={set('direction')} style={inp}>
              <option value="buy">Buy</option><option value="sell">Sell</option>
            </select>
          </label>
          <label style={lbl}>Trade Type
            <select value={form.trade_type} onChange={set('trade_type')} style={inp}>
              {typeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={lbl}>{isOptions(form.instrument) ? 'Premium (₹)' : 'Price (₹)'}
            <input type="number" min="0" step="0.05" required value={form.price} onChange={set('price')} style={inp} placeholder="e.g. 100" />
          </label>
          <label style={lbl}>Quantity
            <input type="number" min="1" step="1" required value={form.quantity} onChange={set('quantity')} style={inp} placeholder="e.g. 50" />
          </label>
          {showOptionFields && (
            <label style={lbl}>Option Type
              <select value={form.option_type} onChange={set('option_type')} style={inp}>
                <option value="call">Call</option><option value="put">Put</option>
              </select>
            </label>
          )}
          {showExerciseFields && (<>
            <label style={lbl}>Strike (₹)
              <input type="number" min="0" step="0.05" required value={form.strike} onChange={set('strike')} style={inp} placeholder="e.g. 22000" />
            </label>
            <label style={lbl}>Spot at Expiry (₹)
              <input type="number" min="0" step="0.05" required value={form.spot} onChange={set('spot')} style={inp} placeholder="e.g. 22500" />
            </label>
          </>)}
        </div>
        <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Calculating…' : 'Calculate'}</button>
      </form>

      {error && <div style={{ ...notice, background: '#fee' }}>❌ {error}</div>}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          {result.notes.map((n, i) => (
            <div key={i} style={{ ...notice, background: n.includes('⚠️') ? '#fff3cd' : '#d4edda' }}>{n}</div>
          ))}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead><tr style={{ background: '#f5f5f5' }}>
              <th style={th}>Charge</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.key} title={row.hint}>
                  <td style={td}>{row.label}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(result[row.key] as number)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #333' }}>
                <td style={td}>Total</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(result.total)}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.75rem', color: 'grey', marginTop: '0.5rem' }}>Hover any row for calculation basis.</p>
        </div>
      )}
      <p style={{ color: '#bbb', fontSize: '0.75rem', marginTop: '2rem' }}>API: {API}</p>
    </main>
  )
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }
const inp: React.CSSProperties = { padding: '0.4rem', fontSize: '0.9rem', border: '1px solid #ccc', borderRadius: '4px' }
const btnStyle: React.CSSProperties = { padding: '0.5rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }
const th: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.85rem', borderBottom: '2px solid #ddd' }
const td: React.CSSProperties = { padding: '0.4rem 0.75rem', borderBottom: '1px solid #eee', fontSize: '0.9rem' }
const notice: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.5rem' }
