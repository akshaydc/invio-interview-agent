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
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="navbar-logo" style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            ASTRA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {candidateName}
            </span>
            <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 16px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
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
            {/* Active applications */}
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

            {/* Inactive applications */}
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
  const matchPct = app.match_percentage

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
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

          {matchPct != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <div style={{
                height: 6, width: 120, borderRadius: 3,
                background: '#E5E7EB', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${matchPct}%`,
                  background: matchPct >= 70 ? '#10B981' : matchPct >= 50 ? '#F59E0B' : '#EF4444',
                }} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {matchPct}% match
              </span>
              {app.recommendation && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  · {app.recommendation}
                </span>
              )}
            </div>
          )}

          {app.interview_slot && app.status === 'interview_scheduled' && (
            <p style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 500, marginTop: 8 }}>
              Scheduled: {app.interview_slot}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
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
      </div>
    </div>
  )
}
