import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

const JOB_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Salesforce Administrator',
  'Product Manager',
  'Salesforce Developer',
  'QA Engineer',
]

type CandidateStatus = 'not_started' | 'applied' | 'invited' | 'in_progress' | 'interviewing' | 'completed'

type Candidate = {
  name: string
  ct_number: string
  email?: string
  phone?: string
  current_role?: string
  current_ctc?: string
  expected_ctc?: string
  notice_period?: string
  job_role: string
  job_description: string
  session_id: string | null
  status: CandidateStatus
  match_percentage?: number | null
  match_summary?: string
  match_strengths?: string[]
  match_gaps?: string[]
  applied_at?: string
  invited_at?: string
}

type Job = {
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

type Props = {
  token: string
  onLogout: () => void
  onViewScorecard: (ctNumber: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  applied: 'Applied',
  invited: 'Invited',
  in_progress: 'Interviewing',
  interviewing: 'Interviewing',
  completed: 'Completed',
}

const STATUS_CLASSES: Record<string, string> = {
  not_started: 'badge badge--muted',
  applied: 'badge badge--muted',
  invited: 'badge badge--blue',
  in_progress: 'badge badge--amber',
  interviewing: 'badge badge--amber',
  completed: 'badge badge--green',
}

function matchBadge(pct: number | null | undefined) {
  if (pct == null) return <span className="muted" style={{ fontSize: '0.85rem' }}>—</span>
  const cls = pct >= 70 ? 'match-badge match-badge--green' : pct >= 50 ? 'match-badge match-badge--amber' : 'match-badge match-badge--red'
  return <span className={cls}>{pct}%</span>
}

type Tab = 'candidates' | 'jobs'

export default function RecruiterDashboard({ token, onLogout, onViewScorecard }: Props) {
  const [tab, setTab] = useState<Tab>('candidates')
  const [expandedCt, setExpandedCt] = useState<string | null>(null)

  // Candidates state
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [showCandidateForm, setShowCandidateForm] = useState(false)
  const [candidateFormError, setCandidateFormError] = useState('')
  const [candidateFormLoading, setCandidateFormLoading] = useState(false)
  const [invitingCt, setInvitingCt] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ctNumber, setCtNumber] = useState('')
  const [jobRole, setJobRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [showJobForm, setShowJobForm] = useState(false)
  const [jobFormError, setJobFormError] = useState('')
  const [jobFormLoading, setJobFormLoading] = useState(false)
  const [jTitle, setJTitle] = useState('')
  const [jDepartment, setJDepartment] = useState('')
  const [jLocation, setJLocation] = useState('')
  const [jJobType, setJJobType] = useState('Full-time')
  const [jExperience, setJExperience] = useState('')
  const [jDescription, setJDescription] = useState('')
  const [jRequirements, setJRequirements] = useState('')

  const headers = { 'X-Auth-Token': token }

  async function fetchCandidates() {
    setCandidatesLoading(true)
    try {
      const res = await axios.get<Candidate[]>(`${API}/recruiter/candidates`, { headers })
      setCandidates(res.data)
    } catch {
      // silent
    } finally {
      setCandidatesLoading(false)
    }
  }

  async function fetchJobs() {
    setJobsLoading(true)
    try {
      const res = await axios.get<Job[]>(`${API}/recruiter/jobs`, { headers })
      setJobs(res.data)
    } catch {
      // silent
    } finally {
      setJobsLoading(false)
    }
  }

  useEffect(() => { fetchCandidates() }, [])
  useEffect(() => { if (tab === 'jobs') fetchJobs() }, [tab])

  function toggleExpand(ct: string) {
    setExpandedCt(prev => prev === ct ? null : ct)
  }

  async function handleInvite(ct: string) {
    setInvitingCt(ct)
    try {
      await axios.post(`${API}/recruiter/candidates/${ct}/invite`, {}, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === ct ? { ...c, status: 'invited' as CandidateStatus } : c)
      )
    } catch {
      // silent — table will refresh on next load
    } finally {
      setInvitingCt(null)
    }
  }

  async function handleCreateCandidate() {
    setCandidateFormError('')
    if (!name.trim() || !ctNumber.trim()) {
      setCandidateFormError('Name and CT Number are required.')
      return
    }
    setCandidateFormLoading(true)
    try {
      await axios.post(
        `${API}/recruiter/candidates`,
        {
          name: name.trim(),
          ct_number: ctNumber.trim().toUpperCase(),
          job_role: customRole.trim() || jobRole,
          job_description: jobDescription,
        },
        { headers }
      )
      setName(''); setCtNumber(''); setJobRole('Software Engineer')
      setCustomRole(''); setJobDescription('')
      setShowCandidateForm(false)
      await fetchCandidates()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to create.' : 'Failed to create.'
      setCandidateFormError(String(msg))
    } finally {
      setCandidateFormLoading(false)
    }
  }

  async function handleCreateJob() {
    setJobFormError('')
    if (!jTitle.trim() || !jDepartment.trim() || !jLocation.trim() || !jDescription.trim()) {
      setJobFormError('Title, department, location, and description are required.')
      return
    }
    setJobFormLoading(true)
    try {
      await axios.post(
        `${API}/recruiter/jobs`,
        {
          title: jTitle.trim(),
          department: jDepartment.trim(),
          location: jLocation.trim(),
          job_type: jJobType,
          experience: jExperience.trim(),
          description: jDescription.trim(),
          requirements: jRequirements.split(',').map(r => r.trim()).filter(Boolean),
        },
        { headers }
      )
      setJTitle(''); setJDepartment(''); setJLocation(''); setJJobType('Full-time')
      setJExperience(''); setJDescription(''); setJRequirements('')
      setShowJobForm(false)
      await fetchJobs()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to create job.' : 'Failed to create job.'
      setJobFormError(String(msg))
    } finally {
      setJobFormLoading(false)
    }
  }

  async function handleCloseJob(jobId: string) {
    try {
      await axios.put(`${API}/recruiter/jobs/${jobId}`, { status: 'closed' }, { headers })
      await fetchJobs()
    } catch {
      // silent
    }
  }

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <h1 className="title" style={{ fontSize: '1.6rem' }}>Recruiter Dashboard</h1>
          <p className="muted" style={{ marginTop: 2 }}>Invio · AI Interview Portal</p>
        </div>
        <div className="dash-header-actions">
          {tab === 'candidates' && (
            <>
              <button className="btn btn-secondary" onClick={fetchCandidates}>Refresh</button>
              <button className="btn btn-primary" onClick={() => setShowCandidateForm(!showCandidateForm)}>
                {showCandidateForm ? 'Cancel' : '+ Add Candidate'}
              </button>
            </>
          )}
          {tab === 'jobs' && (
            <>
              <button className="btn btn-secondary" onClick={fetchJobs}>Refresh</button>
              <button className="btn btn-primary" onClick={() => setShowJobForm(!showJobForm)}>
                {showJobForm ? 'Cancel' : '+ Add Job'}
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'candidates' ? ' tab-btn--active' : ''}`} onClick={() => setTab('candidates')}>
          Candidates
        </button>
        <button className={`tab-btn${tab === 'jobs' ? ' tab-btn--active' : ''}`} onClick={() => setTab('jobs')}>
          Manage Jobs
        </button>
      </div>

      {/* ── Candidates tab ── */}
      {tab === 'candidates' && (
        <>
          {showCandidateForm && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>New Candidate</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Full Name</label>
                  <input className="role-input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">CT Number</label>
                  <input className="role-input" placeholder="CT001" value={ctNumber} onChange={e => setCtNumber(e.target.value.toUpperCase())} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Role</label>
                  <select className="role-select" value={jobRole} onChange={e => { setJobRole(e.target.value); setCustomRole('') }}>
                    {JOB_ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                  <label className="role-label" style={{ marginTop: 8 }}>Or custom role</label>
                  <input className="role-input" placeholder="e.g. DevOps Engineer" value={customRole} onChange={e => setCustomRole(e.target.value)} />
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Job Description (optional)</label>
                  <textarea className="role-textarea" placeholder="Paste job description..." value={jobDescription} onChange={e => setJobDescription(e.target.value)} />
                </div>
              </div>
              {candidateFormError && <p className="error-text" style={{ marginTop: 12 }}>{candidateFormError}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreateCandidate} disabled={candidateFormLoading}>
                {candidateFormLoading ? 'Creating...' : 'Create Candidate'}
              </button>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--text)' }}>Candidates ({candidates.length})</h3>
            </div>
            {candidatesLoading ? (
              <p className="muted" style={{ padding: 24 }}>Loading...</p>
            ) : candidates.length === 0 ? (
              <p className="muted" style={{ padding: 24 }}>No candidates yet. Add one above.</p>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>CT Number</th>
                      <th>Job Role</th>
                      <th>Match %</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map(c => (
                      <>
                        <tr
                          key={c.ct_number}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleExpand(c.ct_number)}
                        >
                          <td style={{ fontWeight: 500 }}>{c.name}</td>
                          <td style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{c.ct_number}</td>
                          <td>{c.job_role}</td>
                          <td onClick={e => e.stopPropagation()}>{matchBadge(c.match_percentage)}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <span className={STATUS_CLASSES[c.status] ?? 'badge badge--muted'}>
                              {STATUS_LABELS[c.status] ?? c.status}
                            </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            {c.status === 'applied' && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                                disabled={invitingCt === c.ct_number}
                                onClick={() => handleInvite(c.ct_number)}
                              >
                                {invitingCt === c.ct_number ? 'Inviting...' : 'Invite'}
                              </button>
                            )}
                            {c.status === 'completed' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                                onClick={() => onViewScorecard(c.ct_number)}
                              >
                                Scorecard
                              </button>
                            )}
                          </td>
                        </tr>

                        {expandedCt === c.ct_number && (
                          <tr key={`${c.ct_number}-detail`}>
                            <td colSpan={6} style={{ padding: 0, background: 'var(--surface-2)' }}>
                              <div className="candidate-panel">

                                {/* ── Candidate details grid ── */}
                                <div className="candidate-details-grid">
                                  {c.email && (
                                    <div className="candidate-detail-item">
                                      <span className="role-label">Email</span>
                                      <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.email}</span>
                                    </div>
                                  )}
                                  {c.phone && (
                                    <div className="candidate-detail-item">
                                      <span className="role-label">Phone</span>
                                      <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.phone}</span>
                                    </div>
                                  )}
                                  {c.current_role && (
                                    <div className="candidate-detail-item">
                                      <span className="role-label">Current Role</span>
                                      <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.current_role}</span>
                                    </div>
                                  )}
                                  {c.notice_period && (
                                    <div className="candidate-detail-item">
                                      <span className="role-label">Notice Period</span>
                                      <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.notice_period}</span>
                                    </div>
                                  )}
                                  {(c.current_ctc || c.expected_ctc) && (
                                    <div className="candidate-detail-item">
                                      <span className="role-label">CTC (Current → Expected)</span>
                                      <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>
                                        {c.current_ctc || '—'} → {c.expected_ctc || '—'}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* ── Match analysis ── */}
                                {c.match_percentage != null ? (
                                  <>
                                    <div className="candidate-panel-match" style={{ marginTop: 20 }}>
                                      <div
                                        className="candidate-match-score"
                                        style={{
                                          color: c.match_percentage >= 70
                                            ? 'var(--green)'
                                            : c.match_percentage >= 50
                                            ? '#f59e0b'
                                            : 'var(--red)',
                                        }}
                                      >
                                        {c.match_percentage}%
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <p className="role-label" style={{ marginBottom: 6 }}>Match Summary</p>
                                        <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                          {c.match_summary || '—'}
                                        </p>
                                      </div>
                                    </div>

                                    {(c.match_strengths?.length || c.match_gaps?.length) ? (
                                      <div className="two-col" style={{ marginTop: 16 }}>
                                        {c.match_strengths && c.match_strengths.length > 0 && (
                                          <div>
                                            <p className="role-label" style={{ marginBottom: 8 }}>Strengths</p>
                                            <ul className="tag-list tag-list--green">
                                              {c.match_strengths.map((s, i) => <li key={i}>{s}</li>)}
                                            </ul>
                                          </div>
                                        )}
                                        {c.match_gaps && c.match_gaps.length > 0 && (
                                          <div>
                                            <p className="role-label" style={{ marginBottom: 8 }}>Gaps</p>
                                            <ul className="tag-list tag-list--red">
                                              {c.match_gaps.map((g, i) => <li key={i}>{g}</li>)}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <p className="muted" style={{ fontSize: '0.875rem', marginTop: 12 }}>
                                    No resume analysis available.
                                  </p>
                                )}

                                {/* ── Action buttons ── */}
                                <div className="candidate-panel-actions">
                                  {c.status === 'applied' && (
                                    <button
                                      className="btn btn-primary"
                                      style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                      disabled={invitingCt === c.ct_number}
                                      onClick={e => { e.stopPropagation(); handleInvite(c.ct_number) }}
                                    >
                                      {invitingCt === c.ct_number ? 'Inviting...' : 'Invite for Interview'}
                                    </button>
                                  )}
                                  {c.status === 'invited' && (
                                    <span style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>
                                      Invitation sent
                                    </span>
                                  )}
                                  {c.status === 'completed' && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                      onClick={e => { e.stopPropagation(); onViewScorecard(c.ct_number) }}
                                    >
                                      View Scorecard
                                    </button>
                                  )}
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Manage Jobs tab ── */}
      {tab === 'jobs' && (
        <>
          {showJobForm && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>New Job Posting</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Job Title</label>
                  <input className="role-input" placeholder="e.g. Software Engineer" value={jTitle} onChange={e => setJTitle(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Department</label>
                  <input className="role-input" placeholder="e.g. Engineering" value={jDepartment} onChange={e => setJDepartment(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Location</label>
                  <input className="role-input" placeholder="e.g. Remote" value={jLocation} onChange={e => setJLocation(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Type</label>
                  <select className="role-select" value={jJobType} onChange={e => setJJobType(e.target.value)}>
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Internship</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Experience</label>
                  <input className="role-input" placeholder="e.g. 3-5 years" value={jExperience} onChange={e => setJExperience(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Requirements (comma-separated)</label>
                  <input className="role-input" placeholder="Python, React, FastAPI" value={jRequirements} onChange={e => setJRequirements(e.target.value)} />
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Job Description</label>
                  <textarea className="role-textarea" placeholder="Full job description..." value={jDescription} onChange={e => setJDescription(e.target.value)} />
                </div>
              </div>
              {jobFormError && <p className="error-text" style={{ marginTop: 12 }}>{jobFormError}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreateJob} disabled={jobFormLoading}>
                {jobFormLoading ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--text)' }}>Job Postings ({jobs.length})</h3>
            </div>
            {jobsLoading ? (
              <p className="muted" style={{ padding: 24 }}>Loading...</p>
            ) : jobs.length === 0 ? (
              <p className="muted" style={{ padding: 24 }}>No jobs yet. Add one above.</p>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Location</th>
                      <th>Experience</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 500 }}>{j.title}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.department}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.location}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.experience}</td>
                        <td>
                          <span className={j.status === 'open' ? 'badge badge--green' : 'badge badge--muted'}>
                            {j.status === 'open' ? 'Open' : 'Closed'}
                          </span>
                        </td>
                        <td>
                          {j.status === 'open' && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                              onClick={() => handleCloseJob(j.id)}
                            >
                              Close Job
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
