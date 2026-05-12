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
      <div className="login-card">
        <h1 className="login-title">Invio</h1>
        <p className="login-subtitle">Recruiter Login</p>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          onClick={onBack}
        >
          &#8592; Back to job listings
        </button>
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
  )
}
