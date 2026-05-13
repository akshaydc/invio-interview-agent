import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Violation = { type: string; timestamp: string; reason?: string }

type Scorecard = {
  communication: number
  technical_depth: number
  problem_solving: number
  cultural_fit: number
  summary: string
  strengths: string[]
  red_flags: string[]
  transcript: TranscriptEntry[]
  violations?: Violation[]
  note?: string
  match_percentage?: number
  recommendation?: string
}

function violationLabel(type: string) {
  if (type === 'tab_switch') return 'Tab switch'
  if (type === 'window_blur') return 'Window focus lost'
  if (type === 'face_detection') return 'Face detection'
  return type
}

type Candidate = {
  name: string
  ct_number: string
  job_role: string
}

type Props = {
  token: string
  ctNumber: string
  onBack: () => void
}

export default function ScorecardView({ token, ctNumber, onBack }: Props) {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get<{ candidate: Candidate; scorecard: Scorecard }>(
        `${API}/recruiter/candidates/${ctNumber}/scorecard`,
        { headers: { 'X-Auth-Token': token } }
      )
      .then((res) => {
        setCandidate(res.data.candidate)
        setScorecard(res.data.scorecard)
      })
      .catch(() => setError('Failed to load scorecard.'))
  }, [ctNumber, token])

  const metrics = scorecard
    ? [
        { label: 'Communication', value: scorecard.communication },
        { label: 'Technical Depth', value: scorecard.technical_depth },
        { label: 'Problem Solving', value: scorecard.problem_solving },
        { label: 'Cultural Fit', value: scorecard.cultural_fit },
      ]
    : []

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>
            ← Back to Dashboard
          </button>
          <h1 className="title" style={{ fontSize: '1.6rem' }}>Scorecard</h1>
          {candidate && (
            <p className="muted">
              {candidate.name} · <span style={{ fontFamily: 'monospace' }}>{candidate.ct_number}</span> · {candidate.job_role}
            </p>
          )}
        </div>
      </div>

      {error && <div className="card center-card"><p className="error-text">{error}</p></div>}

      {!scorecard && !error && <div className="card center-card"><p className="muted">Loading...</p></div>}

      {scorecard && (
        <>
          {scorecard.note && (
            <div style={{
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              borderRadius: 8,
              padding: '12px 16px',
              color: 'var(--primary-light)',
              fontSize: '0.9rem',
              marginBottom: 16,
            }}>
              ℹ {scorecard.note}
            </div>
          )}

          <div className="scores-grid">
            {metrics.map((m) => (
              <div key={m.label} className="card score-card">
                <span className="score-number">{m.value}</span>
                <span className="score-label">{m.label}</span>
              </div>
            ))}
          </div>

          <div className="card summary-card">
            <h3>Summary</h3>
            <p style={{ marginTop: 8, lineHeight: 1.7 }}>{scorecard.summary}</p>
          </div>

          <div className="two-col">
            <div className="card">
              <h3>Strengths</h3>
              <ul className="tag-list tag-list--green" style={{ marginTop: 12 }}>
                {scorecard.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div className="card">
              <h3>Red Flags</h3>
              {scorecard.red_flags.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>None identified.</p>
              ) : (
                <ul className="tag-list tag-list--red" style={{ marginTop: 12 }}>
                  {scorecard.red_flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Transcript</h3>
            {!scorecard.transcript || scorecard.transcript.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>No interview transcript available for this candidate.</p>
            ) : (
              <div className="transcript-list" style={{ marginTop: 16 }}>
                {scorecard.transcript.filter((e) => e.q).map((entry, i) => (
                  <div key={i} className="transcript-entry">
                    <p className="transcript-q"><strong>Q:</strong> {entry.q}</p>
                    {entry.a && <p className="transcript-a"><strong>A:</strong> {entry.a}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Proctoring Report</h3>
            {scorecard.note ? (
              <p className="muted" style={{ marginTop: 12, fontSize: '0.95rem' }}>
                No proctoring data available.
              </p>
            ) : !scorecard.violations || scorecard.violations.length === 0 ? (
              <p style={{ color: 'var(--green)', marginTop: 12, fontSize: '0.95rem' }}>
                No violations detected — clean interview.
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--red)', fontWeight: 600, marginTop: 12, marginBottom: 12 }}>
                  {scorecard.violations.length} warning{scorecard.violations.length !== 1 ? 's' : ''} detected
                </p>
                <ul className="tag-list tag-list--red">
                  {scorecard.violations.map((v, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <span>
                        <strong>{violationLabel(v.type)}</strong>
                        {v.reason ? ` — ${v.reason}` : ''}
                      </span>
                      <span className="muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
