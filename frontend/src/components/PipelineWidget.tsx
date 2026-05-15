import { useEffect, useState } from 'react'

export type Analytics = {
  total: number
  by_status: {
    applied: number
    shortlisted: number
    interview_scheduled: number
    interview_complete: number
    rejected: number
  }
  role_breakdown: Record<
    string,
    {
      job_id: string
      total: number
      applied: number
      shortlisted: number
      interview_scheduled: number
      interview_complete: number
      rejected: number
      avg_match: number
    }
  >
  shortlist_rate: number
  completion_rate: number
}

type Props = {
  analytics: Analytics
}

const FUNNEL_STAGES = [
  { key: 'applied' as const, label: 'Applied', color: '#64748b' },
  { key: 'shortlisted' as const, label: 'Shortlisted', color: '#7C3AED' },
  { key: 'interview_scheduled' as const, label: 'Scheduled', color: '#185FA5' },
  { key: 'interview_complete' as const, label: 'Completed', color: '#0F6E56' },
  { key: 'rejected' as const, label: 'Rejected', color: '#A32D2D' },
]

function Pill({
  label, color, bg,
}: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 20,
      background: bg, color, fontWeight: 500, marginLeft: 8, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function StatCard({
  value, label, sub, color,
}: { value: number | string; label: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4,
      flex: 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-display)', color, lineHeight: 1.1 }}>
        {value}
      </span>
      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color, opacity: 0.85 }}>{sub}</span>}
    </div>
  )
}

function FunnelBar({
  label, count, pct, color, animate,
}: { label: string; count: number; pct: number; color: string; animate: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 80, fontSize: 12, color: '#64748b', flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 32, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: animate ? `${Math.max(pct, count > 0 ? 2 : 0)}%` : '0%',
          background: color, borderRadius: 6,
          transition: 'width 0.8s ease-out',
        }} />
      </div>
      <span style={{ width: 40, fontSize: 12, color: '#64748b', flexShrink: 0 }}>{count}</span>
      <span style={{ width: 44, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
        {count > 0 ? `${pct.toFixed(0)}%` : ''}
      </span>
    </div>
  )
}

function matchColor(pct: number) {
  if (pct >= 70) return '#0F6E56'
  if (pct >= 50) return '#854F0B'
  return '#A32D2D'
}

function StatusBadge({ count, color, bg }: { count: number; color: string; bg: string }) {
  if (count === 0) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
  return (
    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: bg, color, fontWeight: 500 }}>
      {count}
    </span>
  )
}

// Simple inline SVG icons (no icon library dependency)
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" /><rect x="10" y="7" width="4" height="14" /><rect x="17" y="3" width="4" height="18" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#378ADD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default function PipelineWidget({ analytics }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [animateBars, setAnimateBars] = useState(false)

  const { total, by_status, role_breakdown, shortlist_rate, completion_rate } = analytics

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setAnimateBars(true), 80)
      return () => clearTimeout(t)
    } else {
      setAnimateBars(false)
    }
  }, [isOpen])

  const bestRole = Object.entries(role_breakdown).sort(
    (a, b) => b[1].avg_match - a[1].avg_match
  )[0]

  return (
    <div style={{ marginTop: 32, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>

        {/* Collapsible header bar */}
        <div
          onClick={() => setIsOpen(o => !o)}
          style={{
            height: 52, padding: '0 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <IconChart />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#042C53' }}>Pipeline Analytics</span>
            <Pill label={`${total} total`} color="#64748b" bg="#f1f5f9" />
            <Pill label={`${by_status.shortlisted} shortlisted`} color="#5B21B6" bg="#EDE9FE" />
            <Pill label={`${by_status.interview_scheduled} scheduled`} color="#185FA5" bg="#EBF4FF" />
            <Pill label={`${by_status.interview_complete} completed`} color="#0F6E56" bg="#E1F5EE" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 16 }}>
            <span style={{ fontSize: 12, color: '#378ADD', fontWeight: 500 }}>
              {isOpen ? 'Hide Analytics' : 'View Analytics'}
            </span>
            <IconChevron open={isOpen} />
          </div>
        </div>

        {/* Expandable content */}
        <div style={{
          maxHeight: isOpen ? '2000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
        }}>
          <div style={{
            borderTop: '1px solid #e2e8f0',
            padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>

            {/* Section 1 — Summary stats */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <StatCard value={total} label="Total Applications" sub="across all roles" color="#042C53" />
              <StatCard value={by_status.shortlisted} label="Shortlisted" sub={`${shortlist_rate}% shortlist rate`} color="#5B21B6" />
              <StatCard value={by_status.interview_scheduled} label="Interview Scheduled" color="#185FA5" />
              <StatCard value={by_status.interview_complete} label="Interview Completed" sub={`${completion_rate}% completion rate`} color="#0F6E56" />
            </div>

            {/* Section 2 — Funnel */}
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#042C53', marginBottom: 4 }}>Pipeline Funnel</span>
              {FUNNEL_STAGES.map(stage => {
                const count = by_status[stage.key] ?? 0
                const pct = total > 0 ? (count / total) * 100 : 0
                return (
                  <FunnelBar
                    key={stage.key}
                    label={stage.label}
                    count={count}
                    pct={pct}
                    color={stage.color}
                    animate={animateBars}
                  />
                )
              })}
            </div>

            {/* Section 3 — Per role breakdown */}
            {Object.keys(role_breakdown).length > 0 && (
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#042C53', display: 'block', marginBottom: 12 }}>
                  Applications by Role
                </span>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Role', 'Total', 'Applied', 'Shortlisted', 'Scheduled', 'Completed', 'Avg Match'].map(h => (
                          <th key={h} style={{
                            padding: '8px 12px', textAlign: 'left',
                            color: '#378ADD', fontSize: 11, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            borderBottom: '1px solid #e2e8f0',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(role_breakdown).map(([role, data]) => (
                        <tr key={data.job_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', color: '#042C53', fontWeight: 500 }}>{role}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>{data.total}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge count={data.applied} color="#64748b" bg="#f1f5f9" />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge count={data.shortlisted} color="#5B21B6" bg="#EDE9FE" />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge count={data.interview_scheduled} color="#185FA5" bg="#EBF4FF" />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge count={data.interview_complete} color="#0F6E56" bg="#E1F5EE" />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {data.avg_match > 0 ? (
                              <span style={{ fontWeight: 600, color: matchColor(data.avg_match) }}>
                                {data.avg_match}%
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 4 — Insight pills */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {bestRole && (
                <span style={{ background: '#EBF4FF', color: '#0C447C', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 500 }}>
                  🏆 Best performing role: {bestRole[0]} ({bestRole[1].avg_match}%)
                </span>
              )}
              <span style={{ background: '#EBF4FF', color: '#0C447C', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 500 }}>
                ⚡ {shortlist_rate}% of applicants shortlisted
              </span>
              <span style={{ background: '#EBF4FF', color: '#0C447C', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 500 }}>
                ✅ {by_status.interview_complete} interview{by_status.interview_complete !== 1 ? 's' : ''} completed
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
