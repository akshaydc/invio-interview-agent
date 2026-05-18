import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import type { Job } from './JobListings'

type InternalRecord = {
  id: string
  type: 'internal_apply' | 'referral'
  employee_id: string
  job_id: string
  job_title: string
  job_department?: string
  job_location?: string
  candidate_name?: string
  candidate_email?: string
  candidate_phone?: string
  status: string
  note?: string
  created_at: string
}

type Props = {
  token: string
  employeeId: string
  onLogout: () => void
}

export default function InternalEmployeeDashboard({ token, employeeId, onLogout }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [activity, setActivity] = useState<InternalRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionJobId, setActionJobId] = useState('')
  const [referJob, setReferJob] = useState<Job | null>(null)
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [candidatePhone, setCandidatePhone] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const headers = { 'X-Auth-Token': token }

  async function load() {
    setLoading(true)
    try {
      const [jobsRes, activityRes] = await Promise.all([
        axios.get<Job[]>(`${API}/jobs`),
        axios.get<InternalRecord[]>(`${API}/internal/activity`, { headers }),
      ])
      setJobs(jobsRes.data)
      setActivity(activityRes.data)
    } catch {
      setError('Could not load internal jobs. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(job =>
      job.id.toLowerCase().includes(q) ||
      job.title.toLowerCase().includes(q) ||
      job.department.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q)
    )
  }, [jobs, query])

  const appliedJobIds = useMemo(
    () => new Set(activity.filter(a => a.type === 'internal_apply').map(a => a.job_id)),
    [activity]
  )

  async function handleInternalApply(job: Job) {
    setActionJobId(job.id)
    setError('')
    setMessage('')
    try {
      const res = await axios.post<{ message: string; record: InternalRecord }>(
        `${API}/internal/jobs/${job.id}/apply`,
        { note: '' },
        { headers }
      )
      setActivity(prev => [res.data.record, ...prev])
      setMessage(res.data.message)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Could not apply.' : 'Could not apply.'
      setError(String(msg))
    } finally {
      setActionJobId('')
    }
  }

  async function handleRefer() {
    if (!referJob) return
    setActionJobId(referJob.id)
    setError('')
    setMessage('')
    try {
      const res = await axios.post<{ message: string; record: InternalRecord }>(
        `${API}/internal/jobs/${referJob.id}/refer`,
        {
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          note,
        },
        { headers }
      )
      setActivity(prev => [res.data.record, ...prev])
      setMessage(res.data.message)
      setReferJob(null)
      setCandidateName('')
      setCandidateEmail('')
      setCandidatePhone('')
      setNote('')
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Could not submit referral.' : 'Could not submit referral.'
      setError(String(msg))
    } finally {
      setActionJobId('')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="navbar-logo" style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', letterSpacing: '0.08em' }}>
            ASTRA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{employeeId}</span>
            <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 16px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="internal-dashboard">
        <header className="internal-dashboard__header">
          <div>
            <p className="login-eyebrow">Internal Employee Portal</p>
            <h1>Open roles and referrals</h1>
            <p>Search by job ID or browse all openings. Internal applications are submitted directly to recruiting.</p>
          </div>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>
        </header>

        {message && <div className="info-box">{message}</div>}
        {error && <div className="internal-alert internal-alert--error">{error}</div>}

        <section className="card internal-search">
          <label className="role-label" htmlFor="job-search">Search Job ID or opening</label>
          <input
            id="job-search"
            className="role-input"
            placeholder="Paste a job ID or search by title, department, location"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </section>

        <section>
          <div className="internal-section-heading">
            <h2>Browse All Openings</h2>
            <span>{filteredJobs.length} role{filteredJobs.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            <p className="muted" style={{ padding: '24px 0' }}>Loading jobs...</p>
          ) : (
            <div className="jobs-grid">
              {filteredJobs.map(job => (
                <article className="job-card" key={job.id}>
                  <div>
                    <span className="job-dept-badge">{job.department}</span>
                  </div>
                  <h3 className="job-card-title">{job.title}</h3>
                  <div className="job-meta">
                    <span className="job-meta-item">{job.location}</span>
                    <span className="job-meta-sep">/</span>
                    <span className="job-meta-item">{job.job_type}</span>
                    <span className="job-meta-sep">/</span>
                    <span className="job-meta-item">{job.experience}</span>
                  </div>
                  <p className="job-desc-preview">
                    {job.description.slice(0, 120)}{job.description.length > 120 ? '...' : ''}
                  </p>
                  <div className="internal-job-actions">
                    <button
                      className="btn btn-primary"
                      disabled={actionJobId === job.id || appliedJobIds.has(job.id)}
                      onClick={() => handleInternalApply(job)}
                    >
                      {appliedJobIds.has(job.id) ? 'Applied' : actionJobId === job.id ? 'Submitting...' : 'Internal Apply'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setReferJob(job)}>
                      Refer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="internal-section-heading">
            <h2>My Activity</h2>
            <span>{activity.length} item{activity.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {activity.length === 0 ? (
              <p className="muted" style={{ padding: 24 }}>No internal applications or referrals yet.</p>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Role</th>
                      <th>Candidate</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map(item => (
                      <tr key={item.id}>
                        <td>{item.type === 'internal_apply' ? 'Internal Apply' : 'Referral'}</td>
                        <td>
                          <strong>{item.job_title}</strong>
                          <div className="muted" style={{ fontSize: '0.78rem' }}>{item.job_id}</div>
                        </td>
                        <td>{item.type === 'referral' ? `${item.candidate_name} (${item.candidate_email})` : employeeId}</td>
                        <td><span className="badge badge--blue">{item.status}</span></td>
                        <td>{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {referJob && (
        <div className="modal-overlay">
          <div className="modal-card internal-referral-modal">
            <h2>Refer for {referJob.title}</h2>
            <p className="muted">Add the candidate details for recruiter review.</p>
            <div className="login-fields" style={{ width: '100%' }}>
              <input className="role-input" placeholder="Candidate name" value={candidateName} onChange={e => setCandidateName(e.target.value)} />
              <input className="role-input" placeholder="Candidate email" value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} />
              <input className="role-input" placeholder="Candidate phone (optional)" value={candidatePhone} onChange={e => setCandidatePhone(e.target.value)} />
              <textarea className="role-textarea" placeholder="Referral note (optional)" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setReferJob(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRefer} disabled={actionJobId === referJob.id}>
                {actionJobId === referJob.id ? 'Submitting...' : 'Submit Referral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
