import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import PageLayout from '../components/PageLayout'

export type Job = {
  id: string
  title: string
  department: string
  location: string
  job_type: string
  experience: string
  description: string
  requirements: string[]
  status: string
  created_at: string
}

type AppliedJob = {
  job_id: string
  job_title: string
  ct_number: string
  applied_at: string
}

type Props = {
  onSelectJob: (job: Job) => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
  onHome?: () => void
  sessionAppliedJobs?: AppliedJob[]
}

function formatAppliedDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function JobListings({ onSelectJob, onCandidateLoginClick, onRecruiterLoginClick, onHome, sessionAppliedJobs }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [storedAppliedJobs, setStoredAppliedJobs] = useState<AppliedJob[]>([])
  const [widgetOpen, setWidgetOpen] = useState(false)
  const [copiedCt, setCopiedCt] = useState<string | null>(null)

  useEffect(() => {
    axios.get<Job[]>(`${API}/jobs`)
      .then(res => setJobs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('astra_applied_jobs') ?? '[]')
      if (Array.isArray(stored)) setStoredAppliedJobs(stored)
    } catch {
      // ignore
    }
  }, [])

  // Merge localStorage + current-session applied jobs (deduplicate by ct_number)
  const appliedJobs: AppliedJob[] = (() => {
    const session = sessionAppliedJobs ?? []
    const sessionCtNumbers = new Set(session.map(j => j.ct_number))
    const deduped = storedAppliedJobs.filter(j => !sessionCtNumbers.has(j.ct_number))
    return [...deduped, ...session]
  })()

  function copyCtNumber(ct: string) {
    navigator.clipboard.writeText(ct).then(() => {
      setCopiedCt(ct)
      setTimeout(() => setCopiedCt(null), 2000)
    })
  }

  return (
    <PageLayout
      navbar={{
        onHome,
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>Open Positions</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Join our team — find a role that fits your skills and ambitions.
        </p>
      </div>

      {/* Applied Jobs Widget */}
      {appliedJobs.length > 0 && (
        <div style={{
          border: '1px solid #B5D4F4',
          borderLeft: '3px solid #0C447C',
          borderRadius: 8,
          background: '#fff',
          overflow: 'hidden',
        }}>
          <div
            onClick={() => setWidgetOpen(o => !o)}
            style={{
              height: 48,
              padding: '0 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              </svg>
              <span style={{ fontWeight: 500, color: '#042C53', fontSize: '0.9rem' }}>
                You have applied to {appliedJobs.length} role{appliedJobs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.82rem', color: '#0C447C', fontWeight: 500 }}>
                {widgetOpen ? 'Hide' : 'View'}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#0C447C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: widgetOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {widgetOpen && (
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {appliedJobs.map((aj, i) => (
                <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 500, color: '#042C53', fontSize: '0.9rem' }}>
                    {aj.job_title}
                    {aj.applied_at && (
                      <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8, fontSize: '0.82rem' }}>
                        — Applied {formatAppliedDate(aj.applied_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Your CT Number:</span>
                    <button
                      style={{
                        background: 'none', border: '1px solid #B5D4F4', borderRadius: 5,
                        padding: '2px 8px', fontSize: '0.82rem', fontFamily: 'monospace',
                        color: '#0C447C', cursor: 'pointer', fontWeight: 600,
                      }}
                      onClick={() => copyCtNumber(aj.ct_number)}
                      title="Click to copy"
                    >
                      {aj.ct_number}
                      {copiedCt === aj.ct_number && (
                        <span style={{ marginLeft: 6, color: '#0F6E56', fontFamily: 'inherit', fontWeight: 500 }}>✓ Copied</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', alignSelf: 'flex-start', marginTop: 4 }}
                onClick={onCandidateLoginClick}
              >
                Login with CT number →
              </button>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}
                onClick={() => setWidgetOpen(false)}
              >
                Collapse
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>No open positions at the moment.</p>
      ) : (
        <div className="jobs-grid">
          {jobs.map(job => (
            <div key={job.id} className="job-card" onClick={() => onSelectJob(job)}>
              <div>
                <span className="job-dept-badge">{job.department}</span>
              </div>
              <h2 className="job-card-title">{job.title}</h2>
              <div className="job-meta">
                <span className="job-meta-item">{job.location}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.job_type}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.experience}</span>
              </div>
              <p className="job-desc-preview">
                {job.description.slice(0, 100)}{job.description.length > 100 ? '...' : ''}
              </p>
              <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={e => { e.stopPropagation(); onSelectJob(job) }}>
                View &amp; Apply
              </button>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
