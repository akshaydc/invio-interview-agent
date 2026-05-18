import type React from 'react'
import { useState, useEffect } from 'react'
import PageLayout from '../components/PageLayout'

export type JobMatch = {
  job_id: string
  job_title: string
  job_department: string
  job_location: string
  job_type: string
  match_percentage: number
  match_reason: string
  strengths: string[]
  gaps: string[]
}

export type CandidateProfile = {
  skills: string[]
  experience_years: number
  current_role: string
  education: string
  full_name?: string
  email?: string
  phone?: string
  linkedin?: string
  location?: string
}

export type PrefillInfo = {
  name?: string
  email?: string
  phone?: string
  linkedin_url?: string
  current_role?: string
  location?: string
}

export type CandidateInfo = {
  name: string
  email: string
  phone: string
  linkedin_url: string
  current_role: string
  location: string
}

export type ResumeMatchResult = {
  candidate_profile: CandidateProfile
  candidate_info?: CandidateInfo
  matches: JobMatch[]
  resume_text: string
  resume_file: File
}

type Props = {
  matchResult: ResumeMatchResult
  onApply: (jobId: string, jobTitle: string, matchData: JobMatch, prefill: PrefillInfo) => void
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
  onHome?: () => void
}

function pillStyle(pct: number): React.CSSProperties {
  if (pct >= 70) return { background: '#E1F5EE', color: '#0F6E56' }
  if (pct >= 50) return { background: '#FAEEDA', color: '#854F0B' }
  return { background: '#FCEBEB', color: '#A32D2D' }
}

export default function JobMatches({ matchResult, onApply, onBrowseAll, onCandidateLoginClick, onRecruiterLoginClick, onHome }: Props) {
  const { candidate_profile, matches } = matchResult
  const sortedMatches = [...matches].sort((a, b) => b.match_percentage - a.match_percentage)

  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([])

  useEffect(() => {
    const stored = sessionStorage.getItem('astra_session_applied')
    if (stored) {
      try { setAppliedJobIds(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  return (
    <PageLayout
      navbar={{
        onHome,
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
      }}
      contentStyle={{ maxWidth: 900 }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your job matches</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.95rem' }}>
          Based on your resume, here are the roles we think are a great fit for you
        </p>
      </div>

      {/* Candidate profile summary */}
      <div className="card">
        <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>
          Your profile at a glance
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {candidate_profile.current_role && (
            <div>
              <div className="role-label" style={{ marginBottom: 4 }}>Current Role</div>
              <div style={{ color: 'var(--text)', fontWeight: 500 }}>{candidate_profile.current_role}</div>
            </div>
          )}
          {candidate_profile.experience_years > 0 && (
            <div>
              <div className="role-label" style={{ marginBottom: 4 }}>Experience</div>
              <div style={{ color: 'var(--text)', fontWeight: 500 }}>{candidate_profile.experience_years} years</div>
            </div>
          )}
          {candidate_profile.education && (
            <div>
              <div className="role-label" style={{ marginBottom: 4 }}>Education</div>
              <div style={{ color: 'var(--text)', fontWeight: 500 }}>{candidate_profile.education}</div>
            </div>
          )}
        </div>
        {candidate_profile.skills.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="role-label" style={{ marginBottom: 8 }}>Top Skills</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {candidate_profile.skills.map((skill, i) => (
                <span key={i} style={{
                  padding: '4px 14px',
                  background: 'var(--primary-surface)',
                  color: 'var(--primary-light)',
                  border: '1px solid var(--primary-border)',
                  borderRadius: 20,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Match cards */}
      {matches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)' }}>No open positions found matching your resume at this time.</p>
        </div>
      ) : (
        <div className="jobs-grid">
          {sortedMatches.map(m => {
            const isApplied = appliedJobIds.includes(m.job_id)
            return (
              <div key={m.job_id} className="job-card" style={{ position: 'relative', opacity: isApplied ? 0.7 : 1 }}>
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  ...pillStyle(m.match_percentage),
                  fontSize: 15, fontWeight: 700,
                  padding: '4px 12px', borderRadius: 20,
                  lineHeight: 1.4,
                }}>
                  {m.match_percentage}%
                </div>

                <div>
                  <span className="job-dept-badge">{m.job_department}</span>
                </div>
                <h2 className="job-card-title" style={{ paddingRight: 60 }}>
                  {isApplied && <span style={{ color: '#0F6E56', marginRight: 6 }}>✓</span>}
                  {m.job_title}
                </h2>
                <div className="job-meta">
                  {m.job_location && <span className="job-meta-item">{m.job_location}</span>}
                  {m.job_location && m.job_type && <span className="job-meta-sep">·</span>}
                  {m.job_type && <span className="job-meta-item">{m.job_type}</span>}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--primary-light)', fontWeight: 500 }}>
                  {m.match_reason}
                </p>
                {m.strengths.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {m.strengths.slice(0, 3).map((s, i) => (
                      <span key={i} style={{
                        padding: '2px 10px',
                        background: 'var(--green-bg)',
                        color: 'var(--green)',
                        border: '1px solid rgba(15,110,86,0.2)',
                        borderRadius: 20,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={isApplied}
                  style={{
                    marginTop: 4, width: '100%',
                    ...(isApplied ? { background: '#94a3b8', borderColor: '#94a3b8', cursor: 'not-allowed' } : {}),
                  }}
                  onClick={() => {
                    if (isApplied) return
                    const newApplied = [...appliedJobIds, m.job_id]
                    setAppliedJobIds(newApplied)
                    try {
                      sessionStorage.setItem('astra_session_applied', JSON.stringify(newApplied))
                    } catch { /* ignore */ }
                    const cp = matchResult.candidate_profile
                    const ci = matchResult.candidate_info
                    const prefillData: PrefillInfo = {
                      name: cp?.full_name || ci?.name || '',
                      email: cp?.email || ci?.email || '',
                      phone: cp?.phone || ci?.phone || '',
                      linkedin_url: cp?.linkedin || ci?.linkedin_url || '',
                      current_role: cp?.current_role || ci?.current_role || '',
                      location: cp?.location || ci?.location || '',
                    }
                    onApply(m.job_id, m.job_title, m, prefillData)
                  }}
                >
                  {isApplied ? 'Applied ✓' : 'Apply Now'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', paddingBottom: 20 }}>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--primary-lighter)', fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline' }}
          onClick={onBrowseAll}
        >
          View all jobs instead
        </button>
      </div>
    </PageLayout>
  )
}
