import { useState } from 'react'
import axios from 'axios'
import type { AuthInfo } from '../App'
import { API_BASE_URL as API } from '../config'

type Tab = 'recruiter' | 'candidate'

type Props = {
  onLogin: (info: AuthInfo) => void
  onBack?: () => void
}

export default function Login({ onLogin, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('candidate')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [ctNumber, setCtNumber] = useState('')
  const [error, setError] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    setInfoMsg('')
    setLoading(true)
    try {
      if (tab === 'recruiter') {
        const res = await axios.post<{ token: string; role: 'recruiter' }>(
          `${API}/auth/recruiter/login`,
          { username, password }
        )
        onLogin({ token: res.data.token, role: 'recruiter' })
      } else {
        const res = await axios.post<{
          token: string
          role: 'candidate'
          name: string
          ct_number: string
          job_role: string
          job_description: string
        }>(`${API}/auth/candidate/login`, { ct_number: ctNumber })
        onLogin({
          token: res.data.token,
          role: 'candidate',
          name: res.data.name,
          ctNumber: res.data.ct_number,
          jobRole: res.data.job_role,
          jobDescription: res.data.job_description,
        })
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setInfoMsg('Your application is under review. You will receive an invitation once the recruiter shortlists you.')
      } else {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Login failed.' : 'Login failed.'
        setError(String(msg))
      }
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
        <p className="login-subtitle">AI Interview Portal</p>
        {onBack && (
          <button
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            onClick={onBack}
          >
            &#8592; Back to job listings
          </button>
        )}

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'candidate' ? 'active' : ''}`}
            onClick={() => { setTab('candidate'); setError(''); setInfoMsg('') }}
          >
            Candidate
          </button>
          <button
            className={`login-tab ${tab === 'recruiter' ? 'active' : ''}`}
            onClick={() => { setTab('recruiter'); setError(''); setInfoMsg('') }}
          >
            Recruiter
          </button>
        </div>

        {tab === 'recruiter' ? (
          <div className="login-fields">
            <input
              className="role-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onKey}
            />
            <input
              className="role-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
        ) : (
          <div className="login-fields">
            <input
              className="role-input"
              type="text"
              placeholder="CT Number (e.g. CT001)"
              value={ctNumber}
              onChange={(e) => setCtNumber(e.target.value.toUpperCase())}
              onKeyDown={onKey}
            />
          </div>
        )}

        {infoMsg && <div className="info-box">{infoMsg}</div>}
        {error && <p className="error-text">{error}</p>}

        <button
          className="btn btn-primary login-btn"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
