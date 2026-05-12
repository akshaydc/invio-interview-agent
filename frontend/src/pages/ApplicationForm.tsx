import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

const NOTICE_OPTIONS = ['Immediate', '15 days', '30 days', '60 days', '90 days']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  jobId: string
  jobTitle: string
  onBack: () => void
  onApplied: () => void
}

type FieldErrors = Record<string, string>
type Touched = Record<string, boolean>

function validate(
  name: string,
  email: string,
  phone: string,
  currentRole: string,
  currentCtc: string,
  expectedCtc: string,
  resumeFile: File | null,
): FieldErrors {
  const e: FieldErrors = {}
  if (!name.trim() || name.trim().length < 2) e.name = 'Name must be at least 2 characters.'
  if (!email.trim() || !EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.'
  const phoneDigits = phone.replace(/[\s\-]/g, '')
  if (!phoneDigits || !/^\d{10}$/.test(phoneDigits)) e.phone = 'Phone must be exactly 10 digits.'
  if (!currentRole.trim()) e.currentRole = 'Current role is required.'
  const ctcVal = parseFloat(currentCtc.replace(/[,\s]/g, ''))
  if (!currentCtc.trim() || isNaN(ctcVal) || ctcVal <= 0) e.currentCtc = 'Enter a valid positive number.'
  const ectcVal = parseFloat(expectedCtc.replace(/[,\s]/g, ''))
  if (!expectedCtc.trim() || isNaN(ectcVal) || ectcVal <= 0) e.expectedCtc = 'Enter a valid positive number.'
  if (!resumeFile) e.resumeFile = 'Please upload your resume (PDF or TXT).'
  return e
}

function ctcWarning(currentCtc: string, expectedCtc: string): string {
  const cur = parseFloat(currentCtc.replace(/[,\s]/g, ''))
  const exp = parseFloat(expectedCtc.replace(/[,\s]/g, ''))
  if (!isNaN(cur) && !isNaN(exp) && exp < cur) return 'Expected CTC is lower than current CTC.'
  return ''
}

export default function ApplicationForm({ jobId, jobTitle, onBack, onApplied }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [currentCtc, setCurrentCtc] = useState('')
  const [expectedCtc, setExpectedCtc] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('30 days')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [touched, setTouched] = useState<Touched>({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [ctNumber, setCtNumber] = useState('')

  useEffect(() => {
    if (!ctNumber) return
    const timer = setTimeout(() => onApplied(), 4000)
    return () => clearTimeout(timer)
  }, [ctNumber])

  const errors = validate(name, email, phone, currentRole, currentCtc, expectedCtc, resumeFile)
  const isValid = Object.keys(errors).length === 0
  const warning = ctcWarning(currentCtc, expectedCtc)

  function touch(field: string) {
    setTouched(t => ({ ...t, [field]: true }))
  }

  function err(field: string): string | undefined {
    return touched[field] ? errors[field] : undefined
  }

  async function handleSubmit() {
    const allTouched: Touched = { name: true, email: true, phone: true, currentRole: true, currentCtc: true, expectedCtc: true, resumeFile: true }
    setTouched(allTouched)
    if (!isValid) return

    setSubmitError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.replace(/[\s\-]/g, ''))
      fd.append('current_role', currentRole.trim())
      fd.append('current_ctc', currentCtc.trim())
      fd.append('expected_ctc', expectedCtc.trim())
      fd.append('notice_period', noticePeriod)
      if (resumeFile) fd.append('resume', resumeFile)

      const res = await axios.post<{ ct_number: string; message: string }>(
        `${API}/jobs/${jobId}/apply`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setCtNumber(res.data.ct_number)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setSubmitError('You have already applied for this position. Please check your email for your CT number.')
      } else {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Submission failed.' : 'Submission failed.'
        setSubmitError(String(msg))
      }
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
            You'll receive a confirmation email with your CT number shortly. We'll get back to you if your profile matches.
          </p>
          <p className="muted" style={{ fontSize: '0.8rem' }}>Redirecting to jobs in 4 seconds…</p>
          <hr className="thankyou-divider" />
          <button className="btn btn-secondary thankyou-btn" onClick={onApplied}>
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

          {/* Name */}
          <div className="role-select-group">
            <label className="role-label">Full Name *</label>
            <input
              className={`role-input${err('name') ? ' input--error' : ''}`}
              placeholder="Jane Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => touch('name')}
            />
            {err('name') && <span className="field-error">{err('name')}</span>}
          </div>

          {/* Email */}
          <div className="role-select-group">
            <label className="role-label">Email *</label>
            <input
              className={`role-input${err('email') ? ' input--error' : ''}`}
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => touch('email')}
            />
            {err('email') && <span className="field-error">{err('email')}</span>}
          </div>

          {/* Phone */}
          <div className="role-select-group">
            <label className="role-label">Phone * (10 digits)</label>
            <input
              className={`role-input${err('phone') ? ' input--error' : ''}`}
              placeholder="9876543210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onBlur={() => touch('phone')}
            />
            {err('phone') && <span className="field-error">{err('phone')}</span>}
          </div>

          {/* Current Role */}
          <div className="role-select-group">
            <label className="role-label">Current Role *</label>
            <input
              className={`role-input${err('currentRole') ? ' input--error' : ''}`}
              placeholder="e.g. Junior Developer"
              value={currentRole}
              onChange={e => setCurrentRole(e.target.value)}
              onBlur={() => touch('currentRole')}
            />
            {err('currentRole') && <span className="field-error">{err('currentRole')}</span>}
          </div>

          {/* Current CTC */}
          <div className="role-select-group">
            <label className="role-label">Current CTC (INR) *</label>
            <input
              className={`role-input${err('currentCtc') ? ' input--error' : ''}`}
              placeholder="e.g. 800000"
              value={currentCtc}
              onChange={e => setCurrentCtc(e.target.value)}
              onBlur={() => touch('currentCtc')}
            />
            {err('currentCtc') && <span className="field-error">{err('currentCtc')}</span>}
          </div>

          {/* Expected CTC */}
          <div className="role-select-group">
            <label className="role-label">Expected CTC (INR) *</label>
            <input
              className={`role-input${err('expectedCtc') ? ' input--error' : ''}`}
              placeholder="e.g. 1200000"
              value={expectedCtc}
              onChange={e => setExpectedCtc(e.target.value)}
              onBlur={() => touch('expectedCtc')}
            />
            {err('expectedCtc') && <span className="field-error">{err('expectedCtc')}</span>}
            {!err('expectedCtc') && touched.expectedCtc && warning && (
              <span className="field-warning">{warning}</span>
            )}
          </div>

          {/* Notice Period */}
          <div className="role-select-group">
            <label className="role-label">Notice Period *</label>
            <select
              className="role-select"
              value={noticePeriod}
              onChange={e => setNoticePeriod(e.target.value)}
            >
              {NOTICE_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Resume upload */}
          <div className="role-select-group">
            <label className="role-label">Upload Resume (PDF or TXT) *</label>
            <div
              className={`resume-upload-area${err('resumeFile') ? ' resume-upload-area--error' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                style={{ display: 'none' }}
                onChange={e => {
                  setResumeFile(e.target.files?.[0] ?? null)
                  touch('resumeFile')
                }}
              />
              {resumeFile ? (
                <span style={{ color: 'var(--text)' }}>{resumeFile.name}</span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>Click to choose a file&hellip;</span>
              )}
            </div>
            {err('resumeFile') && <span className="field-error">{err('resumeFile')}</span>}
            {resumeFile && (
              <button
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: 4, textAlign: 'left' }}
                onClick={() => { setResumeFile(null); touch('resumeFile'); if (fileInputRef.current) fileInputRef.current.value = '' }}
              >
                Remove file
              </button>
            )}
          </div>

        </div>

        {submitError && <p className="error-text" style={{ marginTop: 12 }}>{submitError}</p>}

        <button
          className="btn btn-primary"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={loading || !isValid}
          title={!isValid ? 'Please fill in all required fields correctly' : undefined}
        >
          {loading ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </div>
  )
}
