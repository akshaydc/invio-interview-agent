import { useState } from 'react'
import axios from 'axios'
import type { AuthInfo } from '../App'
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
        job_role: string
        job_description: string
        status: string
      }>(`${API}/auth/candidate/login`, { ct_number: ctNumber.trim() })
      onLogin({
        token: res.data.token,
        role: 'candidate',
        name: res.data.name,
        ctNumber: res.data.ct_number,
        jobRole: res.data.job_role,
        jobDescription: res.data.job_description,
        status: res.data.status,
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
        <div className="login-card">
        <h1 className="login-title">Invio</h1>
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
  )
}
