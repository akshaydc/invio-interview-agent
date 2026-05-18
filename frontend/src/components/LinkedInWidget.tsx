import { useState } from 'react'

type LinkedInCertification = {
  name: string
  issuer?: string
  verified: boolean
}

type LinkedInSkillsMatch = {
  resume_skills: string[]
  linkedin_skills: string[]
  overlap_percentage: number
  matching?: string[]
}

type LinkedInExperienceComparison = {
  resume_years: number
  linkedin_years: number
  match: boolean
  note: string
}

type LinkedInEducation = {
  school: string
  degree: string
  field: string
}

export type LinkedInAnalysis = {
  linkedin_url: string | null
  status: 'verified_match' | 'mismatch' | 'no_match' | 'no_url' | 'error' | 'no_api_key' | 'partial_match'
  status_label: string
  status_color: string
  overall_score: number | null
  headline?: string
  experience_comparison: LinkedInExperienceComparison | null
  education?: LinkedInEducation[]
  certifications: LinkedInCertification[]
  recent_activity: string[]
  skills_match: LinkedInSkillsMatch | null
  summary?: string
  companies?: string[]
  scanned_at: string | null
}

type Props = {
  linkedin_analysis: LinkedInAnalysis | null | undefined
  combined_score?: number | null
  match_percentage?: number | null
  onScan?: () => void
  scanning?: boolean
}

function statusIcon(status: string) {
  if (status === 'verified_match') return '✓'
  if (status === 'mismatch') return '⚠'
  if (status === 'no_match') return '?'
  return '—'
}

export default function LinkedInWidget({ linkedin_analysis: li, combined_score, match_percentage, onScan, scanning }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!li) return null

  const hasScore = li.overall_score != null

  const resumeSkills = li.skills_match?.resume_skills ?? []
  const linkedinSkills = li.skills_match?.linkedin_skills ?? []
  const matchingSkills = li.skills_match?.matching ?? resumeSkills.filter(s =>
    linkedinSkills.some(ls => ls.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(ls.toLowerCase()))
  )
  const missingSkills = resumeSkills.filter(s => !matchingSkills.includes(s))

  const overlapPct = li.skills_match?.overlap_percentage ?? 0
  const skillBarColor = overlapPct >= 70 ? '#0F6E56' : overlapPct >= 50 ? '#854F0B' : '#A32D2D'

  function formatScannedAt(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{
          width: 26, height: 26, borderRadius: 4, background: '#0A66C2', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13, flexShrink: 0, fontFamily: 'Georgia, serif',
        }}>
          in
        </div>

        <span style={{ fontWeight: 500, color: '#042C53', fontSize: '0.9rem' }}>LinkedIn Analysis</span>

        <span style={{
          fontSize: '0.77rem', fontWeight: 600, color: li.status_color,
          background: li.status_color + '18', borderRadius: 20, padding: '2px 10px',
          border: `1px solid ${li.status_color}40`, flexShrink: 0,
        }}>
          {statusIcon(li.status)} {li.status_label}
        </span>

        {hasScore && (
          <span style={{
            fontSize: '0.77rem', fontWeight: 600, color: li.status_color,
            background: li.status_color + '14', borderRadius: 20, padding: '2px 10px', flexShrink: 0,
          }}>
            {li.overall_score}% LinkedIn match
          </span>
        )}

        <div style={{ flex: 1 }} />
        {onScan && (
          <button
            onClick={e => { e.stopPropagation(); onScan() }}
            disabled={scanning}
            style={{
              background: 'none', border: '1px solid #0C447C', color: '#0C447C',
              borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600,
              cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {scanning ? 'Scanning...' : '🔍 Scan LinkedIn'}
          </button>
        )}
        <span style={{ color: '#94a3b8', fontSize: '0.78rem', flexShrink: 0 }}>
          {expanded ? 'Hide Details ▲' : 'View Details ▼'}
        </span>
      </div>
      {li.scanned_at && (
        <div style={{ padding: '4px 16px 8px', fontSize: '0.73rem', color: '#94a3b8' }}>
          Last scanned: {formatScannedAt(li.scanned_at)}
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>

          {li.experience_comparison && (
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#F8FAFC' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#042C53', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Experience Verification</p>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 80, background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 2 }}>Resume</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: '#042C53' }}>{li.experience_comparison.resume_years} yrs</div>
                </div>
                <div style={{ flex: 1, minWidth: 80, background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 2 }}>LinkedIn</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: '#042C53' }}>{li.experience_comparison.linkedin_years} yrs</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 100, flexShrink: 0 }}>
                  {li.experience_comparison.match ? (
                    <span style={{ color: '#0F6E56', fontWeight: 600, fontSize: '0.85rem' }}>✓ Consistent</span>
                  ) : (
                    <span style={{ color: '#A32D2D', fontWeight: 600, fontSize: '0.85rem' }}>⚠ Discrepancy</span>
                  )}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic' }}>{li.experience_comparison.note}</p>
            </div>
          )}

          {li.education && li.education.length > 0 && (
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#042C53', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Education</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {li.education.map((edu, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#042C53' }}>
                      {[edu.degree, edu.field].filter(Boolean).join(' in ') || 'Degree'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{edu.school}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#042C53', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Certifications Found</p>
            {li.certifications.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>No certifications found</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {li.certifications.map((cert, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: cert.verified ? '#0F6E56' : '#94a3b8', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                      {cert.verified ? '✓' : '—'}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: cert.verified ? '#042C53' : '#94a3b8', fontStyle: cert.verified ? 'normal' : 'italic' }}>
                      {cert.name}
                    </span>
                    {!cert.verified && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>(not verified)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {li.skills_match && (
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#F8FAFC' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#042C53', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skills Alignment</p>
              <div style={{ background: '#e2e8f0', borderRadius: 99, height: 8, marginBottom: 6, overflow: 'hidden' }}>
                <div style={{ width: `${overlapPct}%`, background: skillBarColor, height: '100%', borderRadius: 99 }} />
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#64748b' }}>{overlapPct}% of resume skills found on LinkedIn</p>
              {matchingSkills.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.75rem', color: '#0F6E56', fontWeight: 600, marginBottom: 4 }}>Matching Skills</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {matchingSkills.map((s, i) => (
                      <span key={i} style={{ background: '#E1F5EE', color: '#0F6E56', borderRadius: 99, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 500 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {missingSkills.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Not Found on LinkedIn</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {missingSkills.map((s, i) => (
                      <span key={i} style={{ background: '#F1F5F9', color: '#94a3b8', borderRadius: 99, padding: '2px 10px', fontSize: '0.78rem' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#042C53', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent LinkedIn Activity</p>
            {li.recent_activity.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>No recent activity found</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {li.recent_activity.map((a, i) => (
                  <li key={i} style={{ fontSize: '0.85rem', color: '#475569' }}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          {hasScore && combined_score != null && (
            <div style={{ padding: '12px 18px', background: '#EBF4FF', borderBottom: '1px solid #BFDBFE' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#0C447C', lineHeight: 1.5 }}>
                LinkedIn data contributes <strong>30%</strong> to the overall match score.{' '}
                Combined score: <strong>{combined_score}%</strong>
                {match_percentage != null && match_percentage !== combined_score && (
                  <span style={{ color: '#64748b' }}> (was {match_percentage}% resume-only)</span>
                )}
              </p>
            </div>
          )}

          {li.status === 'no_url' && (
            <div style={{ padding: '12px 18px', background: '#F8FAFC', fontSize: '0.82rem', color: '#64748b' }}>
              Ask candidate to provide LinkedIn URL during profile edit.
            </div>
          )}
          {li.status === 'mismatch' && (
            <div style={{ padding: '12px 18px', background: '#FEF2F2', fontSize: '0.82rem', color: '#A32D2D', fontWeight: 500 }}>
              ⚠ Experience discrepancy detected. Consider verifying before proceeding.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
