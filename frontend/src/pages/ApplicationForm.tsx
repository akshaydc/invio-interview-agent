import { useState } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

const NOTICE_OPTIONS = ['Immediate', '15 days', '30 days', '60 days', '90 days']

type Props = {
  jobId: string
  jobTitle: string
  onBack: () => void
}

export default function ApplicationForm({ jobId, jobTitle, onBack }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [currentCtc, setCurrentCtc] = useState('')
  const [expectedCtc, setExpectedCtc] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('30 days')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ctNumber, setCtNumber] = useState('')

  async function handleSubmit() {
    setError('')
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('Name, email, and phone are required.')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post<{ ct_number: string; message: string }>(
        `${API}/jobs/${jobId}/apply`,
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          current_role: currentRole.trim(),
          current_ctc: currentCtc.trim(),
          expected_ctc: expectedCtc.trim(),
          notice_period: noticePeriod,
        }
      )
      setCtNumber(res.data.ct_number)
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
