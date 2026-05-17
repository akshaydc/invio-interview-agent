import { useEffect, useState } from 'react'
import axios from 'axios'
import type { Application } from '../App'
import { API_BASE_URL as API } from '../config'

type Props = {
  token: string
  candidateName: string
  ctNumber: string
  initialApplications: Application[]
  onLogout: () => void
  onStartInterview: (app: Application) => void
}

const STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  interview_complete: 'Interview Complete',
  rejected: 'Not Progressing',
  withdrawn: 'Withdrawn',
}

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  applied:             { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  shortlisted:         { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  interview_scheduled: { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
  interview_complete:  { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE' },
  rejected:            { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  withdrawn:           { bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLOR[status] ?? STATUS_COLOR.applied
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 20,
      fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.01em',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

// ---------------------------------------------------------------------------
// Journey flow
// ---------------------------------------------------------------------------

const JOURNEY_CSS = `
@keyframes stageRing {
  0%   { box-shadow: 0 0 0 0    rgba(12,68,124,0.45); }
  70%  { box-shadow: 0 0 0 10px rgba(12,68,124,0);    }
  100% { box-shadow: 0 0 0 0    rgba(12,68,124,0);    }
}
.jw  { display: flex; align-items: flex-start; }
.jc  { height: 2px; flex: 1; margin-top: 19px; min-width: 6px; flex-shrink: 1; }
.js  { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.jl  { text-align: center; max-width: 72px; }
.jc-g { background: linear-gradient(to right, #0F6E56, #0C447C); }
.jc-d { background: repeating-linear-gradient(to right, #D1D5DB 0, #D1D5DB 5px, transparent 5px, transparent 10px); }
@media (max-width: 600px) {
  .jw { flex-direction: column; }
  .jc { height: 20px; width: 2px; flex: none; margin-top: 0; margin-left: 19px; }
  .js { flex-direction: row; align-items: flex-start; gap: 12px; }
  .jl { text-align: left; max-width: none; padding-top: 2px; }
  .jc-g { background: linear-gradient(to bottom, #0F6E56, #0C447C); }
  .jc-d { background: repeating-linear-gradient(to bottom, #D1D5DB 0, #D1D5DB 5px, transparent 5px, transparent 10px); }
}
`

let _journeyStylesInjected = false

type StageState = 'done' | 'current' | 'pending'

const STAGE_LABELS = [
  'Application Submitted',
  'Profile Review',
  'Interview Scheduled',
  'AI Interview',
  'Feedback & Decision',
]

const STAGE_ICONS = ['✓', '👁', '📅', '🤖', '📊']

function getStageStates(status: string): Array<StageState | 'na'> {
  switch (status) {
    case 'applied':             return ['done', 'current', 'pending', 'pending', 'pending']
    case 'shortlisted':         return ['done', 'done', 'current', 'pending', 'pending']
    case 'interview_scheduled': return ['done', 'done', 'done', 'current', 'pending']
    case 'interview_complete':  return ['done', 'done', 'done', 'done', 'current']
    case 'rejected':            return ['done', 'done', 'na', 'na', 'na']
    case 'withdrawn':           return ['pending', 'pending', 'pending', 'pending', 'pending']
    default:                    return ['done', 'pending', 'pending', 'pending', 'pending']
  }
}

function getSubtext(stageIdx: number, status: string, slot?: string): string {
  if (status === 'applied'             && stageIdx === 1) return 'Our team is reviewing your profile'
  if (status === 'shortlisted'         && stageIdx === 2) return 'Check your email to book your slot'
  if (status === 'interview_scheduled' && stageIdx === 3) return slot ? `Scheduled for ${slot}` : 'Your interview is scheduled'
  if (status === 'interview_complete'  && stageIdx === 4) return 'Results will be shared soon'
  return ''
}

function renderNode(
  idx: number,
  state: StageState,
  status: string,
  interviewSlot?: string,
) {
  const isDone = state === 'done'
  const isCurrent = state === 'current'
  const subtext = getSubtext(idx, status, interviewSlot)

  const nodeStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, flexShrink: 0,
    ...(isDone
      ? { background: '#0F6E56', color: 'white', border: 'none' }
      : isCurrent
      ? { background: '#0C447C', color: 'white', border: 'none', animation: 'stageRing 1.5s ease-out infinite' }
      : { background: 'white', color: '#94a3b8', border: '2px solid #e2e8f0' }),
  }

  return (
    <div key={`s${idx}`} className="js">
      <div style={nodeStyle}>
        {isDone ? '✓' : isCurrent ? STAGE_ICONS[idx] : '⏳'}
      </div>
      <div className="jl">
        <div style={{
          fontSize: '0.7rem', lineHeight: 1.3, marginTop: 6,
          fontWeight: isCurrent ? 600 : isDone ? 500 : 400,
          color: isCurrent ? '#0C447C' : isDone ? '#0F6E56' : '#94a3b8',
        }}>
          {STAGE_LABELS[idx]}
        </div>
        {subtext && (
          <div style={{ fontSize: '0.67rem', color: '#64748b', marginTop: 3, lineHeight: 1.3 }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  )
}

function renderTerminal(variant: 'rejected' | 'withdrawn') {
  const isRej = variant === 'rejected'
  return (
    <div key="terminal" className="js">
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        background: isRej ? '#FEF2F2' : '#F9FAFB',
        color: isRej ? '#991B1B' : '#6B7280',
        border: `2px solid ${isRej ? '#FECACA' : '#E5E7EB'}`,
      }}>
        {isRej ? '✗' : '—'}
      </div>
      <div className="jl">
        <div style={{
          fontSize: '0.7rem', fontWeight: 600, marginTop: 6, lineHeight: 1.3,
          color: isRej ? '#991B1B' : '#6B7280',
        }}>
          {isRej ? 'Not shortlisted' : 'Withdrawn'}
        </div>
      </div>
    </div>
  )
}

function connector(key: string, cls: string, bg?: string) {
  return <div key={key} className={`jc ${cls}`} style={bg ? { background: bg } : {}} />
}

function JourneyFlow({ status, interviewSlot }: { status: string; interviewSlot?: string }) {
  useEffect(() => {
    if (_journeyStylesInjected) return
    _journeyStylesInjected = true
    const el = document.createElement('style')
    el.textContent = JOURNEY_CSS
    document.head.appendChild(el)
  }, [])

  const states = getStageStates(status)
  const isRejected = status === 'rejected'
  const isWithdrawn = status === 'withdrawn'

  const items: React.ReactNode[] = []

  if (isRejected) {
    items.push(renderNode(0, 'done', status, interviewSlot))
    items.push(connector('c01', '', '#0F6E56'))
    items.push(renderNode(1, 'done', status, interviewSlot))
    items.push(connector('ct', '', '#FECACA'))
    items.push(renderTerminal('rejected'))
  } else if (isWithdrawn) {
    for (let i = 0; i < 5; i++) {
      if (i > 0) items.push(connector(`c${i}`, 'jc-d'))
      items.push(renderNode(i, 'pending', status, interviewSlot))
    }
  } else {
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        const l = states[i - 1] as StageState
        const r = states[i] as StageState
        if (l === 'done' && r === 'done') items.push(connector(`c${i}`, '', '#0F6E56'))
        else if (l === 'done' && r === 'current') items.push(connector(`c${i}`, 'jc-g'))
        else items.push(connector(`c${i}`, 'jc-d'))
      }
      items.push(renderNode(i, states[i] as StageState, status, interviewSlot))
    }
  }

  return (
    <div style={{ marginTop: 20, marginBottom: 4 }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14,
      }}>
        Your Journey
      </div>
      <div className="jw">{items}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function CandidateDashboard({
  token, candidateName, ctNumber, initialApplications, onLogout, onStartInterview,
}: Props) {
  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get<Application[]>(`${API}/candidate/applications`, {
      headers: { 'x-auth-token': token },
    }).then(r => setApplications(r.data)).catch(() => {})
  }, [token])

  async function handleWithdraw(jobId: string) {
    setWithdrawing(jobId)
    setError('')
    try {
      await axios.post(`${API}/candidate/withdraw`, { job_id: jobId }, {
        headers: { 'x-auth-token': token },
      })
      setApplications(prev => prev.map(a =>
        a.job_id === jobId ? { ...a, status: 'withdrawn' } : a
      ))
    } catch {
      setError('Could not withdraw application. Please try again.')
    } finally {
      setWithdrawing(null)
      setConfirmWithdraw(null)
    }
  }

  function handleCopy() {
    copyToClipboard(ctNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const active = applications.filter(a => a.status !== 'withdrawn' && a.status !== 'rejected')
  const inactive = applications.filter(a => a.status === 'withdrawn' || a.status === 'rejected')

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="navbar-logo" style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            ASTRA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{candidateName}</span>
            <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 16px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            My Applications
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>CT Number:</span>
            <code style={{
              fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)',
              background: 'var(--primary-surface)', padding: '2px 10px', borderRadius: 6,
              border: '1px solid var(--primary-border)',
            }}>
              {ctNumber}
            </code>
            <button
              onClick={handleCopy}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', color: copied ? '#0F6E56' : 'var(--text-secondary)',
                padding: '2px 6px',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 16px', background: '#FEF2F2', color: '#991B1B',
            border: '1px solid #FECACA', borderRadius: 8, marginBottom: 16,
            fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {applications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No applications yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Browse open roles and apply to get started.
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {active.map(app => (
                  <ApplicationCard
                    key={app.job_id}
                    app={app}
                    confirmWithdraw={confirmWithdraw}
                    withdrawing={withdrawing}
                    onStartInterview={onStartInterview}
                    onConfirmWithdraw={setConfirmWithdraw}
                    onWithdraw={handleWithdraw}
                  />
                ))}
              </div>
            )}

            {inactive.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{
                  cursor: 'pointer', fontSize: '0.85rem',
                  color: 'var(--text-secondary)', marginBottom: 12,
                  userSelect: 'none', listStyle: 'none',
                }}>
                  + Show {inactive.length} closed application{inactive.length !== 1 ? 's' : ''}
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {inactive.map(app => (
                    <ApplicationCard
                      key={app.job_id}
                      app={app}
                      confirmWithdraw={null}
                      withdrawing={null}
                      onStartInterview={onStartInterview}
                      onConfirmWithdraw={() => {}}
                      onWithdraw={() => {}}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Application card
// ---------------------------------------------------------------------------

type CardProps = {
  app: Application
  confirmWithdraw: string | null
  withdrawing: string | null
  onStartInterview: (app: Application) => void
  onConfirmWithdraw: (jobId: string | null) => void
  onWithdraw: (jobId: string) => void
}

function ApplicationCard({ app, confirmWithdraw, withdrawing, onStartInterview, onConfirmWithdraw, onWithdraw }: CardProps) {
  const isWithdrawable = app.status !== 'withdrawn' && app.status !== 'rejected' && app.status !== 'interview_complete'
  const canInterview = app.status === 'interview_scheduled'
  const jobTitle = app.job_title || app.job_role || 'Position'

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {jobTitle}
        </h3>
        <StatusBadge status={app.status ?? 'applied'} />
      </div>

      {app.applied_at && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
          Applied {new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      {/* Journey stepper */}
      <JourneyFlow status={app.status ?? 'applied'} interviewSlot={app.interview_slot} />

      {/* Action buttons */}
      {(canInterview || isWithdrawable) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {canInterview && (
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '8px 18px', whiteSpace: 'nowrap' }}
              onClick={() => onStartInterview(app)}
            >
              Start Interview →
            </button>
          )}

          {isWithdrawable && (
            confirmWithdraw === app.job_id ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  style={{ fontSize: '0.8rem', padding: '6px 12px', background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}
                  onClick={() => onWithdraw(app.job_id)}
                  disabled={withdrawing === app.job_id}
                >
                  {withdrawing === app.job_id ? 'Withdrawing…' : 'Confirm'}
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => onConfirmWithdraw(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.8rem', padding: '6px 14px', color: 'var(--text-secondary)' }}
                onClick={() => onConfirmWithdraw(app.job_id)}
              >
                Withdraw
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
