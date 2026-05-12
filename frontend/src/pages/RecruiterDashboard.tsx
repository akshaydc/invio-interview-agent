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

type Candidate = {
  name: string
  ct_number: string
  job_role: string
  job_description: string
  session_id: string | null
  status: 'not_started' | 'in_progress' | 'completed'
}

type Props = {
  token: string
  onLogout: () => void
  onViewScorecard: (ctNumber: string) => void
}

const STATUS_LABELS: Record<Candidate['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
}

const STATUS_CLASSES: Record<Candidate['status'], string> = {
  not_started: 'badge badge--muted',
  in_progress: 'badge badge--blue',
  completed: 'badge badge--green',
}

export default function RecruiterDashboard({ token, onLogout, onViewScorecard }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const [name, setName] = useState('')
  const [ctNumber, setCtNumber] = useState('')
  const [jobRole, setJobRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')

  const headers = { 'X-Auth-Token': token }

  async function fetchCandidates() {
    setLoading(true)
    try {
      const res = await axios.get<Candidate[]>(`${API}/recruiter/candidates`, { headers })
      setCandidates(res.data)
    } catch {
      // silent — table stays empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCandidates() }, [])

  async function handleCreate() {
    setFormError('')
    if (!name.trim() || !ctNumber.trim()) {
      setFormError('Name and CT Number are required.')
      return
    }
    setFormLoading(true)
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
      setShowForm(false)
      await fetchCandidates()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to create.' : 'Failed to create.'
      setFormError(String(msg))
    } finally {
      setFormLoading(false)
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
          <button className="btn btn-secondary" onClick={fetchCandidates}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Candidate'}
          </button>
          <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>New Candidate</h3>
          <div className="form-grid">
            <div className="role-select-group">
              <label className="role-label">Full Name</label>
              <input className="role-input" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="role-select-group">
              <label className="role-label">CT Number</label>
              <input className="role-input" placeholder="CT001" value={ctNumber} onChange={(e) => setCtNumber(e.target.value.toUpperCase())} />
            </div>
            <div className="role-select-group">
              <label className="role-label">Job Role</label>
              <select className="role-select" value={jobRole} onChange={(e) => { setJobRole(e.target.value); setCustomRole('') }}>
                {JOB_ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <label className="role-label" style={{ marginTop: 8 }}>Or custom role</label>
              <input className="role-input" placeholder="e.g. DevOps Engineer" value={customRole} onChange={(e) => setCustomRole(e.target.value)} />
            </div>
            <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
              <label className="role-label">Job Description (optional)</label>
              <textarea className="role-textarea" placeholder="Paste job description..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </div>
          </div>
          {formError && <p className="error-text" style={{ marginTop: 12 }}>{formError}</p>}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreate} disabled={formLoading}>
            {formLoading ? 'Creating...' : 'Create Candidate'}
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ color: 'var(--text)' }}>Candidates ({candidates.length})</h3>
        </div>
        {loading ? (
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
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.ct_number}>
                    <td>{c.name}</td>
                    <td style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{c.ct_number}</td>
                    <td>{c.job_role}</td>
                    <td><span className={STATUS_CLASSES[c.status]}>{STATUS_LABELS[c.status]}</span></td>
                    <td>
                      {c.status === 'completed' && (
                        <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => onViewScorecard(c.ct_number)}>
                          View Scorecard
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
    </div>
  )
}
