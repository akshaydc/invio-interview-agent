import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { API_BASE_URL as API } from '../config'
import PageLayout from '../components/PageLayout'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Violation = { type: string; timestamp: string; reason?: string }

type PerQuestion = {
  question_num: number
  question: string
  score: number
  word_count: number
  hesitant: number
  volume: number
}

type ConfidenceAnalysis = {
  average_score: number
  label: string
  color: string
  trend: 'improving' | 'declining' | 'steady'
  peak_question: string
  peak_score: number
  lowest_question: string
  lowest_score: number
  per_question: PerQuestion[]
  total_words: number
}

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
  proctoring?: {
    total_violations: number
    clean: boolean
    details: Violation[]
    auto_ended?: boolean
  }
  note?: string
  match_percentage?: number
  recommendation?: string
  confidence_analysis?: ConfidenceAnalysis
}

function violationLabel(type: string) {
  if (type === 'tab_switch') return 'Tab switch'
  if (type === 'window_blur') return 'Window focus lost'
  if (type === 'face_detection') return 'Face detection'
  return type
}

type Candidate = { name: string; ct_number: string; job_role: string }
type Props = { token: string; ctNumber: string; onBack: () => void }

// ─── Custom tooltip for the area chart ─────────────────────────────────────
function ConfidenceTooltip({ active, payload }: { active?: boolean; payload?: { payload: PerQuestion & { score: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 12,
      maxWidth: 220,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <p style={{ fontWeight: 700, color: '#042C53', marginBottom: 4 }}>Q{d.question_num} — {d.score}/100</p>
      <p style={{ color: '#64748b', lineHeight: 1.4 }}>{d.question}</p>
    </div>
  )
}

// ─── Per-question bar row ───────────────────────────────────────────────────
function QuestionBar({ q }: { q: PerQuestion }) {
  const barColor = q.score >= 70 ? '#0F6E56' : q.score >= 50 ? '#854F0B' : '#A32D2D'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          background: '#EBF4FF', color: '#0C447C', fontWeight: 700,
          fontSize: 11, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
        }}>
          Q{q.question_num}
        </span>
        <span style={{ flex: 1, fontSize: 13, color: '#042C53', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {q.question}
        </span>
        <span style={{ fontWeight: 700, fontSize: 14, color: barColor, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
          {q.score}
        </span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${q.score}%`,
          background: barColor,
          borderRadius: 4,
          transition: 'width 0.8s ease',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {q.hesitant > 0 && (
          <span style={{ background: '#FAEEDA', color: '#854F0B', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
            {q.hesitant} hesitant signal{q.hesitant !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ background: '#F8FAFC', color: '#64748b', fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
          {q.word_count} words
        </span>
      </div>
    </div>
  )
}

// ─── Confidence section ─────────────────────────────────────────────────────
function ConfidenceSection({ ca }: { ca: ConfidenceAnalysis }) {
  const chartData = ca.per_question.map(q => ({
    ...q,
    name: `Q${q.question_num}`,
  }))

  const trendIcon = ca.trend === 'improving' ? '↑' : ca.trend === 'declining' ? '↓' : '—'
  const trendColor = ca.trend === 'improving' ? '#0F6E56' : ca.trend === 'declining' ? '#A32D2D' : '#378ADD'
  const trendLabel = ca.trend === 'improving' ? 'Gaining confidence' : ca.trend === 'declining' ? 'Started stronger' : 'Consistent throughout'

  const peakIdx = ca.per_question.findIndex(q => q.score === ca.peak_score)
  const lowestIdx = ca.per_question.findIndex(q => q.score === ca.lowest_score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#042C53', fontWeight: 400, marginBottom: 4 }}>
            Confidence &amp; Communication Analysis
          </h2>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Based on vocal patterns, speech pace, and language analysis across all answers
          </p>
        </div>
        <span style={{ background: '#E6F1FB', color: '#0C447C', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em', flexShrink: 0 }}>
          AI-POWERED
        </span>
      </div>

      {/* Header card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
        {/* Big score */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              color: ca.color,
            }}>
              {ca.average_score}
            </span>
            <span style={{ fontSize: 20, color: '#64748b', fontWeight: 400 }}>&thinsp;/ 100</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              background: ca.color + '18',
              color: ca.color,
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
            }}>
              {ca.label}
            </span>
            <span style={{ color: trendColor, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 16 }}>{trendIcon}</span>
              {trendLabel}
            </span>
          </div>
        </div>

        {/* Metric pills */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#042C53' }}>{ca.total_words}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>total words</div>
          </div>
          <div style={{ background: '#E1F5EE', border: '1px solid #B7E2D2', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0F6E56' }}>
              Q{peakIdx + 1} · {ca.peak_score}
            </div>
            <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 2 }}>peak confidence</div>
          </div>
          <div style={{ background: '#FAEEDA', border: '1px solid #F5D9A8', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#854F0B' }}>
              Q{lowestIdx + 1} · {ca.lowest_score}
            </div>
            <div style={{ fontSize: 11, color: '#854F0B', marginTop: 2 }}>most hesitant</div>
          </div>
        </div>
      </div>

      {/* Area chart */}
      <div className="card" style={{ padding: '20px 16px 8px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Confidence across questions
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0C447C" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#EBF4FF" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
            <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: 'baseline', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip content={<ConfidenceTooltip />} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#0C447C"
              strokeWidth={2.5}
              fill="url(#confGrad)"
              dot={{ r: 5, fill: '#0C447C', strokeWidth: 0 }}
              activeDot={{ r: 7, fill: '#0C447C' }}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Per-question breakdown */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Per-question breakdown
        </p>
        {ca.per_question.map(q => <QuestionBar key={q.question_num} q={q} />)}
      </div>

      {/* Insight cards */}
      <div className="two-col">
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid #0F6E56',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>⭐</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0F6E56' }}>Strongest answer</span>
          </div>
          <p style={{ fontSize: 13, color: '#042C53', lineHeight: 1.5, flex: 1 }}>{ca.peak_question}</p>
          <span style={{ background: '#E1F5EE', color: '#0F6E56', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' }}>
            {ca.peak_score} / 100
          </span>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid #854F0B',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>💡</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#854F0B' }}>Most hesitant answer</span>
          </div>
          <p style={{ fontSize: 13, color: '#042C53', lineHeight: 1.5, flex: 1 }}>{ca.lowest_question}</p>
          <span style={{ background: '#FAEEDA', color: '#854F0B', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' }}>
            {ca.lowest_score} / 100
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────
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
    <PageLayout
      navbar={{
        rightContent: (
          <button className="btn btn-secondary" onClick={onBack}>← Back to Dashboard</button>
        ),
      }}
    >
      <div>
        <h1 className="title" style={{ fontSize: '1.6rem' }}>Interview Feedback</h1>
        {candidate && (
          <p className="muted" style={{ marginTop: 4 }}>
            {candidate.name} · <span style={{ fontFamily: 'monospace' }}>{candidate.ct_number}</span> · {candidate.job_role}
          </p>
        )}
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

          {/* Confidence & Communication Analysis */}
          {scorecard.confidence_analysis ? (
            <ConfidenceSection ca={scorecard.confidence_analysis} />
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Confidence analysis not available for this session
              </p>
            </div>
          )}

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
            {(() => {
              const violations = scorecard.proctoring?.details ?? scorecard.violations ?? []
              const totalViolations = scorecard.proctoring?.total_violations ?? violations.length
              const wasAutoEnded = scorecard.proctoring?.auto_ended ?? false
              if (totalViolations === 0 && !wasAutoEnded) {
                return (
                  <p style={{ color: 'var(--green)', marginTop: 12, fontSize: '0.95rem' }}>
                    No violations detected — clean interview.
                  </p>
                )
              }
              return (
                <>
                  <p style={{ color: 'var(--red)', fontWeight: 600, marginTop: 12, marginBottom: 12 }}>
                    {totalViolations} violation{totalViolations !== 1 ? 's' : ''} detected
                  </p>
                  {wasAutoEnded && (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 7, padding: '10px 14px', marginBottom: 12, fontSize: '0.875rem', color: '#92400E' }}>
                      Interview was automatically ended due to repeated proctoring violations.
                    </div>
                  )}
                  {violations.length > 0 && (
                    <ul className="tag-list tag-list--red">
                      {violations.map((v, i) => (
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
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}
    </PageLayout>
  )
}
