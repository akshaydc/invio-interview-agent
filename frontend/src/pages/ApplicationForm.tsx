import { useRef, useState } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

const NOTICE_OPTIONS = ['Immediate', '15 days', '30 days', '60 days', '90 days']

type Props = {
  jobId: string
  jobTitle: string
  onBack: () => void
}

function matchColor(pct: number): string {
  if (pct >= 70) return 'var(--green)'
  if (pct >= 50) return '#f59e0b'
  return 'var(--red)'
}

export default function ApplicationForm({ jobId, jobTitle, onBack }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [currentCtc, setCurrentCtc] = useState('')
  const [expectedCtc, setExpectedCtc] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('30 days')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ctNumber, setCtNumber] = useState('')
  const [matchPct, setMatchPct] = useState<number | null>(null)

  async function handleSubmit() {
    setError('')
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('Name, email, and phone are required.')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
      fd.append('current_role', currentRole.trim())
      fd.append('current_ctc', currentCtc.trim())
      fd.append('expected_ctc', expectedCtc.trim())
      fd.append('notice_period', noticePeriod)
      if (resumeFile) fd.append('resume', resumeFile)

      const res = await axios.post<{ ct_number: string; message: string; match_percentage?: number }>(
        `${API}/jobs/${jobId}/apply`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setCtNumber(res.data.ct_number)
      if (res.data.match_percentage !== undefined) {
        setMatchPct(res.data.match_percentage)
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Submission failed.' : 'Submission failed.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  if (ctNumber) {
    return (
      <div className="login-page">
        <div className="thankyou-card">
          <div className="thankyou-check-circle">
            <span className="thankyou-checkmark">&#10003;</span>
          </div>
          <h2 className="thankyou-heading">Application Submitted!</h2>
          <p className="thankyou-sub">
            Your CT Number is:{' '}
            <strong style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{ctNumber}</strong>
          </p>
          {matchPct !== null && (
            <div
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${matchColor(matchPct)}`,
                borderRadius: 10,
                padding: '14px 24px',
                textAlign: 'center',
                width: '100%',
              }}
            >
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: matchColor(matchPct), lineHeight: 1 }}>
                {matchPct}%
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 4 }}>
                Your profile is a{' '}
                <strong style={{ color: matchColor(matchPct) }}>
                  {matchPct >= 70 ? 'strong' : matchPct >= 50 ? 'moderate' : 'partial'}
                </strong>{' '}
                match for this role
              </div>
            </div>
          )}
          <p className="thankyou-sub">
            Check your email for login details. You will be contacted by the recruiter to schedule your AI interview.
          </p>
          <hr className="thankyou-divider" />
          <button className="btn btn-secondary thankyou-btn" onClick={onBack}>
            Back to Jobs
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <span className="jobs-nav-logo">Invio</span>
          <p className="muted" style={{ marginTop: 4 }}>
            Applying for: <strong style={{ color: 'var(--text)' }}>{jobTitle}</strong>
          </p>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 20, color: 'var(--text)' }}>Your Details</h3>
        <div className="form-grid">
          <div className="role-select-group">
            <label className="role-label">Full Name *</label>
            <input className="role-input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Email *</label>
            <input className="role-input" type="email" placeholder="jane@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Phone *</label>
            <input className="role-input" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Current Role</label>
            <input className="role-input" placeholder="e.g. Junior Developer" value={currentRole} onChange={e => setCurrentRole(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Current CTC (INR)</label>
            <input className="role-input" placeholder="e.g. 8,00,000" value={currentCtc} onChange={e => setCurrentCtc(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Expected CTC (INR)</label>
            <input className="role-input" placeholder="e.g. 12,00,000" value={expectedCtc} onChange={e => setExpectedCtc(e.target.value)} />
          </div>
          <div className="role-select-group">
            <label className="role-label">Notice Period</label>
            <select className="role-select" value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)}>
              {NOTICE_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="role-select-group">
            <label className="role-label">Upload Resume (PDF or TXT)</label>
            <div className="resume-upload-area" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                style={{ display: 'none' }}
                onChange={e => setResumeFile(e.target.files?.[0] ?? null)}
              />
              {resumeFile ? (
                <span style={{ color: 'var(--text)' }}>{resumeFile.name}</span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>Click to choose a file&hellip;</span>
              )}
            </div>
            {resumeFile && (
              <button
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: 4, textAlign: 'left' }}
                onClick={() => { setResumeFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              >
                Remove file
              </button>
            )}
          </div>
        </div>
        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </div>
  )
}
