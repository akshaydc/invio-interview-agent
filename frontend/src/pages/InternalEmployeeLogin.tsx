import { useState } from 'react'
import axios from 'axios'
import type { AuthInfo } from '../App'
import { API_BASE_URL as API } from '../config'

type Props = {
  onLogin: (info: AuthInfo) => void
  onBack: () => void
}

export default function InternalEmployeeLogin({ onLogin, onBack }: Props) {
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const id = employeeId.trim().toUpperCase()
    setError('')
    if (!/^P\d{9}$/.test(id)) {
      setError('Enter a valid employee ID like P123456789.')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post<{ token: string; role: 'internal'; employee_id: string }>(
        `${API}/auth/internal/login`,
        { employee_id: id }
      )
      onLogin({ token: res.data.token, role: 'internal', employeeId: res.data.employee_id })
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
          <section className="login-context" aria-label="Internal employee access">
            <div>
              <p className="login-eyebrow">Internal Employee Portal</p>
              <h2>Find roles, apply internally, or refer a candidate.</h2>
              <p>
                Sign in with your employee ID to search openings by job ID, submit an internal application,
                and track referrals from one workspace.
              </p>
            </div>

            <div className="login-tile-grid">
              <div className="login-info-tile">
                <span>ID</span>
                <strong>P ID access</strong>
                <small>Use your P followed by nine digits.</small>
              </div>
              <div className="login-info-tile">
                <span>JA</span>
                <strong>Internal apply</strong>
                <small>Submit interest without AI interview scheduling.</small>
              </div>
              <div className="login-info-tile login-info-tile--wide">
                <span>RF</span>
                <strong>Refer talent</strong>
                <small>Send referrals to the recruiter dashboard for review.</small>
              </div>
            </div>
          </section>

          <div className="login-card">
            <h1 className="login-title" style={{ fontFamily: 'var(--font-display)' }}>ASTRA</h1>
            <p className="login-subtitle">Internal Employee Login</p>
            <div className="login-fields">
              <input
                className="role-input"
                type="text"
                placeholder="Employee ID (e.g. P123456789)"
                value={employeeId}
                maxLength={10}
                onChange={e => setEmployeeId(e.target.value.toUpperCase())}
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
