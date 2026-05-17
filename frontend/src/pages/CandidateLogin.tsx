import { useState } from 'react'
import axios from 'axios'
import type { AuthInfo, Application } from '../App'
import { API_BASE_URL as API } from '../config'

type Props = {
  onLogin: (info: AuthInfo) => void
  onBack: () => void
}

export default function CandidateLogin({ onLogin, onBack }: Props) {
  const [ctNumber, setCtNumber] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!ctNumber.trim()) {
      setError('Please enter your CT Number.')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post<{
        token: string
        role: 'candidate'
        name: string
        ct_number: string
        applications: Application[]
      }>(`${API}/auth/candidate/login`, { ct_number: ctNumber.trim() })
      onLogin({
        token: res.data.token,
        role: 'candidate',
        name: res.data.name,
        ctNumber: res.data.ct_number,
        applications: res.data.applications,
      })
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Login failed.' : 'Login failed.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <button className="btn-back-login" onClick={onBack}>
          &#8592; Back to Job Listings
        </button>

        <div className="login-split">
          <section className="login-context" aria-label="Candidate access">
            <div>
              <p className="login-eyebrow">Candidate Portal</p>
              <h2>Return to your interview journey.</h2>
              <p>
                Use your CT number to check the role, schedule status, and enter the interview room when it is time.
              </p>
            </div>

            <div className="login-tile-grid">
              <div className="login-info-tile">
                <span>01</span>
                <strong>Status</strong>
                <small>See where your application stands.</small>
              </div>
              <div className="login-info-tile">
                <span>02</span>
                <strong>Schedule</strong>
                <small>Review confirmed interview timing.</small>
              </div>
              <div className="login-info-tile login-info-tile--wide">
                <span>03</span>
                <strong>Interview</strong>
                <small>Join the guided interview experience from one place.</small>
              </div>
            </div>
          </section>

          <div className="login-card">
            <h1 className="login-title" style={{ fontFamily: 'var(--font-display)' }}>ASTRA</h1>
            <p className="login-subtitle">Candidate Login</p>
            <div className="login-fields">
              <input
                className="role-input"
                type="text"
                placeholder="CT Number (e.g. CT20260042)"
                value={ctNumber}
                onChange={e => setCtNumber(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary login-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
