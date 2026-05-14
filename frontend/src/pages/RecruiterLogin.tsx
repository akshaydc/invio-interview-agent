import { useState } from 'react'
import axios from 'axios'
import type { AuthInfo } from '../App'
import { API_BASE_URL as API } from '../config'

type Props = {
  onLogin: (info: AuthInfo) => void
  onBack: () => void
}

export default function RecruiterLogin({ onLogin, onBack }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await axios.post<{ token: string; role: 'recruiter' }>(
        `${API}/auth/recruiter/login`,
        { username, password }
      )
      onLogin({ token: res.data.token, role: 'recruiter' })
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Login failed.' : 'Login failed.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <button className="btn-back-login" onClick={onBack}>
          &#8592; Back to Job Listings
        </button>

        <div className="login-split">
          <section className="login-context" aria-label="Recruiter access">
            <div>
              <p className="login-eyebrow">Recruiter Workspace</p>
              <h2>Manage the hiring flow with clear signals.</h2>
              <p>
                Sign in to review candidates, shortlist matches, schedule interviews, and inspect scorecards.
              </p>
            </div>

            <div className="login-tile-grid">
              <div className="login-info-tile">
                <span>AI</span>
                <strong>Match signals</strong>
                <small>Ranked fit, strengths, and gaps.</small>
              </div>
              <div className="login-info-tile">
                <span>CT</span>
                <strong>Pipeline</strong>
                <small>Track each candidate by status.</small>
              </div>
              <div className="login-info-tile login-info-tile--wide">
                <span>SC</span>
                <strong>Scorecards</strong>
                <small>Interview summaries ready for recruiter review.</small>
              </div>
            </div>
          </section>

          <div className="login-card">
            <h1 className="login-title" style={{ fontFamily: 'var(--font-display)' }}>ASTRA</h1>
            <p className="login-subtitle">Recruiter Login</p>
            <div className="login-fields">
              <input
                className="role-input"
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={onKey}
              />
              <input
                className="role-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={onKey}
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
