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
}

export type ResumeMatchResult = {
  candidate_profile: CandidateProfile
  matches: JobMatch[]
  resume_text: string
  resume_file: File
}

type Props = {
  matchResult: ResumeMatchResult
  onApply: (jobId: string, jobTitle: string, matchData: JobMatch) => void
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

function matchColor(pct: number) {
  if (pct >= 70) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--red)'
}

function matchBg(pct: number) {
  if (pct >= 70) return 'var(--green-bg)'
  if (pct >= 50) return 'var(--amber-bg)'
  return 'var(--red-bg)'
}

export default function JobMatches({ matchResult, onApply, onBrowseAll, onCandidateLoginClick, onRecruiterLoginClick }: Props) {
  const { candidate_profile, matches } = matchResult

  return (
    <div className="jobs-page">
      <nav className="jobs-nav">
        <div>
          <span className="jobs-nav-logo">Invio</span>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>AI Interview Portal</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={onCandidateLoginClick}>Candidate Login</button>
          <button className="btn btn-primary" onClick={onRecruiterLoginClick}>Recruiter Login</button>
        </div>
      </nav>

      <div className="jobs-hero">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your job matches</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.95rem' }}>
          Based on your resume, here are the roles we think are a great fit for you
        </p>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>

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
            {matches.map(m => (
              <div key={m.job_id} className="job-card" style={{ position: 'relative' }}>
                {/* Match % badge */}
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  width: 52, height: 52,
                  borderRadius: '50%',
                  background: matchBg(m.match_percentage),
                  border: `2px solid ${matchColor(m.match_percentage)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column',
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: matchColor(m.match_percentage), lineHeight: 1 }}>
                    {m.match_percentage}
                  </span>
                  <span style={{ fontSize: '0.55rem', color: matchColor(m.match_percentage), fontWeight: 600 }}>%</span>
                </div>

                <div>
                  <span className="job-dept-badge">{m.job_department}</span>
                </div>
                <h2 className="job-card-title" style={{ paddingRight: 60 }}>{m.job_title}</h2>
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
                  style={{ marginTop: 4, width: '100%' }}
                  onClick={() => onApply(m.job_id, m.job_title, m)}
                >
                  Apply Now
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--primary-lighter)', fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={onBrowseAll}
          >
            View all jobs instead
          </button>
        </div>
      </div>
    </div>
  )
}
