import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import PageLayout from '../components/PageLayout'

const NOTICE_OPTIONS = ['Immediate', '15 days', '30 days', '60 days', '90 days']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/.+/

type PrefillData = {
  name?: string
  email?: string
  phone?: string
  linkedinUrl?: string
  currentRole?: string
  location?: string
  resumeFile?: File
  matchData?: {
    match_percentage?: number
    match_reason?: string
    strengths?: string[]
    gaps?: string[]
  }
}

type Props = {
  jobId: string
  jobTitle: string
  onBack: () => void
  onApplied: () => void
  prefill?: PrefillData
}

type FieldErrors = Record<string, string>
type Touched = Record<string, boolean>

const PHONE_RE = /^[+\d\s\-()]{7,20}$/

function validate(
  name: string,
  email: string,
  phone: string,
  linkedinUrl: string,
  location: string,
  currentRole: string,
  currentCtc: string,
  expectedCtc: string,
  resumeFile: File | null,
  resumePreloaded = false,
): FieldErrors {
  const e: FieldErrors = {}
  if (!name.trim() || name.trim().length < 2) e.name = 'Name must be at least 2 characters.'
  if (!email.trim() || !EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.'
  if (!phone.trim() || !PHONE_RE.test(phone.trim())) e.phone = 'Please enter a valid phone number.'
  if (linkedinUrl.trim() && !LINKEDIN_RE.test(linkedinUrl.trim())) e.linkedinUrl = 'Must start with https://linkedin.com/in/ or https://www.linkedin.com/in/'
  if (!location.trim()) e.location = 'Current location is required.'
  if (!currentRole.trim()) e.currentRole = 'Current role is required.'
  const ctcVal = parseFloat(currentCtc.replace(/[,\s]/g, ''))
  if (!currentCtc.trim() || isNaN(ctcVal) || ctcVal <= 0) e.currentCtc = 'Enter a valid positive number.'
  const ectcVal = parseFloat(expectedCtc.replace(/[,\s]/g, ''))
  if (!expectedCtc.trim() || isNaN(ectcVal) || ectcVal <= 0) e.expectedCtc = 'Enter a valid positive number.'
  if (!resumeFile && !resumePreloaded) e.resumeFile = 'Please upload your resume (PDF or TXT).'
  return e
}

function ctcWarning(currentCtc: string, expectedCtc: string): string {
  const cur = parseFloat(currentCtc.replace(/[,\s]/g, ''))
  const exp = parseFloat(expectedCtc.replace(/[,\s]/g, ''))
  if (!isNaN(cur) && !isNaN(exp) && exp < cur) return 'Expected CTC is lower than current CTC.'
  return ''
}

export default function ApplicationForm({ jobId, jobTitle, onBack, onApplied, prefill }: Props) {
  const [name, setName] = useState(prefill?.name ?? '')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [phone, setPhone] = useState(prefill?.phone ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(prefill?.linkedinUrl ?? '')
  const [location, setLocation] = useState(prefill?.location ?? '')
  const [currentRole, setCurrentRole] = useState(prefill?.currentRole ?? '')
  const [currentCtc, setCurrentCtc] = useState('')
  const [expectedCtc, setExpectedCtc] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('30 days')
  const [resumeFile, setResumeFile] = useState<File | null>(prefill?.resumeFile ?? null)
  const resumePreloaded = !!prefill?.resumeFile
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [touched, setTouched] = useState<Touched>({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [duplicateError, setDuplicateError] = useState('')
  const [ctNumber, setCtNumber] = useState('')

  useEffect(() => {
    if (!prefill) return
    console.log('Setting prefill:', prefill)
    if (prefill.name) setName(prefill.name)
    if (prefill.email) setEmail(prefill.email)
    if (prefill.phone) setPhone(prefill.phone)
    if (prefill.linkedinUrl) setLinkedinUrl(prefill.linkedinUrl)
    if (prefill.currentRole) setCurrentRole(prefill.currentRole)
    if (prefill.location) setLocation(prefill.location)
  }, [prefill])

  useEffect(() => {
    if (!ctNumber) return
    const timer = setTimeout(() => onApplied(), 4000)
    return () => clearTimeout(timer)
  }, [ctNumber])

  const errors = validate(name, email, phone, linkedinUrl, location, currentRole, currentCtc, expectedCtc, resumeFile, resumePreloaded)
  const isValid = Object.keys(errors).length === 0
  const warning = ctcWarning(currentCtc, expectedCtc)

  function touch(field: string) {
    setTouched(t => ({ ...t, [field]: true }))
  }

  function err(field: string): string | undefined {
    return touched[field] ? errors[field] : undefined
  }

  async function handleSubmit() {
    const allTouched: Touched = { name: true, email: true, phone: true, location: true, currentRole: true, currentCtc: true, expectedCtc: true, resumeFile: true }
    setTouched(allTouched)
    if (!isValid) return

    setSubmitError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.replace(/[\s\-]/g, ''))
      fd.append('linkedin_url', linkedinUrl.trim())
      fd.append('location', location.trim())
      fd.append('current_role', currentRole.trim())
      fd.append('current_ctc', currentCtc.trim())
      fd.append('expected_ctc', expectedCtc.trim())
      fd.append('notice_period', noticePeriod)
      if (resumeFile) fd.append('resume', resumeFile)
      if (prefill?.matchData) fd.append('match_data', JSON.stringify(prefill.matchData))

      const res = await axios.post<{ ct_number: string; message: string }>(
        `${API}/jobs/${jobId}/apply`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setCtNumber(res.data.ct_number)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setDuplicateError('You have already applied for this position. Please check your email for your CT number.')
      } else {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Submission failed.' : 'Submission failed.'
        setSubmitError(String(msg))
      }
    } finally {
      setLoading(false)
    }
  }

  const hasPrefill = !!(prefill?.name || prefill?.email || prefill?.phone || prefill?.linkedinUrl || prefill?.currentRole || prefill?.location || prefill?.resumeFile)

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
    <PageLayout
      navbar={{
        rightContent: (
          <button className="btn btn-secondary" onClick={onBack}>Back</button>
        ),
      }}
    >
      <div>
        <p className="muted">
          Applying for: <strong style={{ color: 'var(--text)' }}>{jobTitle}</strong>
        </p>
      </div>

      {hasPrefill && (
        <div style={{
          background: 'var(--primary-bg)',
          border: '1px solid var(--primary-border)',
          borderRadius: 8,
          padding: '12px 16px',
          color: 'var(--primary-light)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}>
          Your details have been pre-filled from your resume. Please review and complete any missing information.
        </div>
      )}

      {duplicateError && (
        <div style={{
          background: 'var(--red-bg)',
          border: '1px solid rgba(163,45,45,0.3)',
          borderRadius: 8,
          padding: '14px 18px',
          color: 'var(--red)',
          fontSize: '0.9rem',
          lineHeight: 1.6,
        }}>
          {duplicateError}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 20, color: 'var(--text)' }}>Your Details</h3>
        <div className="form-grid">

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

          <div className="role-select-group">
            <label className="role-label">Email *</label>
            <input
              className={`role-input${err('email') ? ' input--error' : ''}`}
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setDuplicateError('') }}
              onBlur={() => touch('email')}
            />
            {err('email') && <span className="field-error">{err('email')}</span>}
          </div>

          <div className="role-select-group">
            <label className="role-label">LinkedIn Profile URL</label>
            <input
              className={`role-input${err('linkedinUrl') ? ' input--error' : ''}`}
              placeholder="https://linkedin.com/in/yourprofile"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              onBlur={() => touch('linkedinUrl')}
            />
            {err('linkedinUrl') && <span className="field-error">{err('linkedinUrl')}</span>}
          </div>

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

          <div className="role-select-group">
            <label className="role-label">Current Location *</label>
            <input
              className={`role-input${err('location') ? ' input--error' : ''}`}
              placeholder="City, State"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onBlur={() => touch('location')}
            />
            {err('location') && <span className="field-error">{err('location')}</span>}
          </div>

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

          <div className="role-select-group">
            <label className="role-label">Upload Resume (PDF or TXT) *</label>
            {resumePreloaded && !resumeFile ? (
              <div className="resume-upload-area" style={{ borderStyle: 'solid', borderColor: 'var(--primary-border)', background: 'var(--primary-bg)' }}>
                <span style={{ color: 'var(--primary-light)', fontWeight: 500 }}>
                  ✓ Resume already uploaded
                </span>
              </div>
            ) : (
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
            )}
            {err('resumeFile') && <span className="field-error">{err('resumeFile')}</span>}
            {resumeFile && (
              <button
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: 4, textAlign: 'left' }}
                onClick={() => { setResumeFile(null); touch('resumeFile'); if (fileInputRef.current) fileInputRef.current.value = '' }}
              >
                {resumePreloaded ? 'Replace with different file' : 'Remove file'}
              </button>
            )}
          </div>

        </div>

        {submitError && <p className="error-text" style={{ marginTop: 12 }}>{submitError}</p>}

        <button
          className="btn btn-primary"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={loading || !isValid || !!duplicateError}
          title={!isValid ? 'Please fill in all required fields correctly' : undefined}
        >
          {loading ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </PageLayout>
  )
}
