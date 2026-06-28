import { useState, useEffect, useRef, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

const API = import.meta.env.VITE_SYSTEM_MONITOR_API_URL ?? 'http://localhost:8004'
const isLocal = API.includes('localhost')
const PUBLIC_BASE = isLocal ? '' : `https://trading-strategies.duckdns.org${
  import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
}`

// ── Types ────────────────────────────────────────────────────────────────────

interface EndpointStat {
  count: number
  avg_ms: number
  p95_ms: number
  p99_ms: number
}

interface ServiceMetrics {
  service: string
  git_commit: string
  git_branch: string
  started_at: string
  uptime_seconds: number
  memory: { rss_mb: number; vms_mb: number }
  cpu_percent: number
  disk: { used_gb: number; total_gb: number; percent: number }
  network: { bytes_sent: number; bytes_recv: number }
  request_stats: Record<string, EndpointStat>
}

interface ServiceStatus {
  name: string
  display_name: string
  health: 'healthy' | 'degraded' | 'unreachable' | 'unknown'
  last_heartbeat: string | null
  metrics: ServiceMetrics | null
  error: string | null
}

interface StreamPayload {
  timestamp: string
  services: ServiceStatus[]
}

interface HistoryPoint {
  t: string
  cpu: number
  mem: number
  net_sent: number
  net_recv: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBytes = (b: number) => {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const healthColor = (h: ServiceStatus['health']) =>
  ({ healthy: '#16a34a', degraded: '#d97706', unreachable: '#dc2626', unknown: '#6b7280' }[h])

const HEALTH_LABEL: Record<ServiceStatus['health'], string> = {
  healthy: '● Live',
  degraded: '◐ Degraded',
  unreachable: '○ Unreachable',
  unknown: '○ Unknown',
}

// ── Spark chart ───────────────────────────────────────────────────────────────

function Spark({ data, dataKey, color, unit }: {
  data: HistoryPoint[]
  dataKey: keyof HistoryPoint
  color: string
  unit: string
}) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: '0.75rem', padding: '4px 8px' }}
          formatter={(v: number) => [`${v}${unit}`, '']}
          labelFormatter={() => ''}
        />
        <Area
          type="monotone"
          dataKey={dataKey as string}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${dataKey})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({ svc, history }: { svc: ServiceStatus; history: HistoryPoint[] }) {
  const [apiOpen, setApiOpen] = useState(false)
  const m = svc.metrics
  const prev = history[history.length - 2]
  const curr = history[history.length - 1]
  const sentDelta = prev && curr ? Math.max(0, curr.net_sent - prev.net_sent) : 0
  const recvDelta = prev && curr ? Math.max(0, curr.net_recv - prev.net_recv) : 0

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{svc.display_name}</h2>
        <span style={{ color: healthColor(svc.health), fontSize: '0.8rem', fontWeight: 600 }}>
          {HEALTH_LABEL[svc.health]}
        </span>
      </div>

      {/* Git + uptime row */}
      <div style={metaGrid}>
        <MetaItem label="Commit" value={m?.git_commit?.slice(0, 7) ?? '—'} mono />
        <MetaItem label="Branch" value={m?.git_branch ?? '—'} mono />
        <MetaItem label="Uptime" value={m ? fmtUptime(m.uptime_seconds) : '—'} />
        <MetaItem
          label="Last heartbeat"
          value={svc.last_heartbeat ? fmtTime(svc.last_heartbeat) : '—'}
        />
      </div>

      {m ? (
        <>
          {/* CPU + Memory charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <ChartPanel label={`CPU — ${m.cpu_percent}%`}>
              <Spark data={history} dataKey="cpu" color="#2563eb" unit="%" />
            </ChartPanel>
            <ChartPanel label={`Memory — ${m.memory.rss_mb} MB RSS`}>
              <Spark data={history} dataKey="mem" color="#9333ea" unit=" MB" />
            </ChartPanel>
          </div>

          {/* Disk + Network row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            {/* Disk */}
            <div style={statBox}>
              <span style={statLabel}>Disk</span>
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, margin: '0.4rem 0' }}>
                <div style={{
                  width: `${m.disk.percent}%`,
                  background: m.disk.percent > 80 ? '#dc2626' : '#2563eb',
                  height: '100%',
                  borderRadius: 4,
                  transition: 'width 0.4s',
                }} />
              </div>
              <span style={statValue}>{m.disk.used_gb} / {m.disk.total_gb} GB ({m.disk.percent}%)</span>
            </div>

            {/* Network */}
            <div style={statBox}>
              <span style={statLabel}>Network (per tick)</span>
              <div style={{ marginTop: '0.35rem' }}>
                <div style={statValue}>↑ {fmtBytes(sentDelta)} / s</div>
                <div style={statValue}>↓ {fmtBytes(recvDelta)} / s</div>
              </div>
              <div style={{ ...statValue, color: '#9ca3af', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                Total: ↑{fmtBytes(m.network.bytes_sent)} ↓{fmtBytes(m.network.bytes_recv)}
              </div>
            </div>
          </div>

          {/* API Inspector */}
          {Object.keys(m.request_stats).length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <button onClick={() => setApiOpen(o => !o)} style={toggleBtn}>
                API Inspector ({Object.keys(m.request_stats).length} endpoints) {apiOpen ? '▲' : '▼'}
              </button>
              {apiOpen && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={th}>Endpoint</th>
                      <th style={{ ...th, textAlign: 'right' }}>Calls</th>
                      <th style={{ ...th, textAlign: 'right' }}>Avg ms</th>
                      <th style={{ ...th, textAlign: 'right' }}>p95 ms</th>
                      <th style={{ ...th, textAlign: 'right' }}>p99 ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(m.request_stats)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([path, s]) => (
                        <tr key={path}>
                          <td style={{ ...td, fontFamily: 'monospace' }}>{path}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{s.count}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{s.avg_ms}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{s.p95_ms}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{s.p99_ms}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      ) : (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {svc.error ?? 'No metrics available'}
        </p>
      )}

      {/* Docs link */}
      {PUBLIC_BASE && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.5rem' }}>
          <a
            href={`${PUBLIC_BASE}/api/${svc.name.replace('_', '-')}/docs`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' }}
          >
            API Docs →
          </a>
        </div>
      )}
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '0.8rem', fontFamily: mono ? 'monospace' : undefined, marginTop: '0.1rem', color: '#111' }}>{value}</div>
    </div>
  )
}

function ChartPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={statBox}>
      <span style={statLabel}>{label}</span>
      <div style={{ marginTop: '0.25rem' }}>{children}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 60

export default function SystemMonitor() {
  const [latest, setLatest] = useState<StreamPayload | null>(null)
  const [connected, setConnected] = useState(false)
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({})
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/stream`)
    esRef.current = es

    es.onopen = () => setConnected(true)

    es.onmessage = (e) => {
      const data: StreamPayload = JSON.parse(e.data)
      setLatest(data)
      const t = fmtTime(data.timestamp)
      setHistory(prev => {
        const next = { ...prev }
        for (const svc of data.services) {
          const m = svc.metrics
          const point: HistoryPoint = {
            t,
            cpu: m?.cpu_percent ?? 0,
            mem: m?.memory.rss_mb ?? 0,
            net_sent: m?.network.bytes_sent ?? 0,
            net_recv: m?.network.bytes_recv ?? 0,
          }
          const arr = [...(next[svc.name] ?? []), point]
          next[svc.name] = arr.slice(-MAX_HISTORY)
        }
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

  return (
    <main style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>System Monitor</h1>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          padding: '0.2rem 0.6rem',
          borderRadius: 999,
          background: connected ? '#dcfce7' : '#fee2e2',
          color: connected ? '#15803d' : '#dc2626',
        }}>
          {connected ? '● Live' : '○ Reconnecting…'}
        </span>
        {latest && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
            Last update: {fmtTime(latest.timestamp)}
          </span>
        )}
      </div>

      {/* Service cards */}
      {latest ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: '1rem' }}>
          {latest.services.map(svc => (
            <ServiceCard key={svc.name} svc={svc} history={history[svc.name] ?? []} />
          ))}
        </div>
      ) : (
        <p style={{ color: '#9ca3af' }}>Connecting to stream…</p>
      )}
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

const metaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '0.5rem',
}

const statBox: React.CSSProperties = {
  background: '#f9fafb',
  borderRadius: 6,
  padding: '0.6rem 0.75rem',
}

const statLabel: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const statValue: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#374151',
  marginTop: '0.1rem',
}

const toggleBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  padding: '0.25rem 0.6rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  color: '#374151',
  width: '100%',
  textAlign: 'left',
}

const th: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
}

const td: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  borderBottom: '1px solid #f3f4f6',
  color: '#374151',
}
