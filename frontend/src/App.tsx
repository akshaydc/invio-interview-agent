import { useState } from 'react'
import Login from './pages/Login'
import RecruiterDashboard from './pages/RecruiterDashboard'
import CandidateInterview from './pages/CandidateInterview'
import ScorecardView from './pages/ScorecardView'
import './index.css'

export type AuthInfo = {
  token: string
  role: 'recruiter' | 'candidate'
  name?: string
  ctNumber?: string
  jobRole?: string
  jobDescription?: string
}

type Page = 'login' | 'recruiter-dashboard' | 'recruiter-scorecard' | 'candidate-interview'

function App() {
  const [page, setPage] = useState<Page>('login')
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [scorecardCt, setScorecardCt] = useState<string>('')

  function handleLogin(info: AuthInfo) {
    setAuth(info)
    setPage(info.role === 'recruiter' ? 'recruiter-dashboard' : 'candidate-interview')
  }

  function handleLogout() {
    setAuth(null)
    setPage('login')
  }

  function handleViewScorecard(ctNumber: string) {
    setScorecardCt(ctNumber)
    setPage('recruiter-scorecard')
  }

  return (
    <div className="app">
      {page === 'login' && <Login onLogin={handleLogin} />}

      {page === 'recruiter-dashboard' && auth && (
        <RecruiterDashboard
          token={auth.token}
          onLogout={handleLogout}
          onViewScorecard={handleViewScorecard}
        />
      )}

      {page === 'recruiter-scorecard' && auth && (
        <ScorecardView
          token={auth.token}
          ctNumber={scorecardCt}
          onBack={() => setPage('recruiter-dashboard')}
        />
      )}

      {page === 'candidate-interview' && auth && (
        <CandidateInterview
          token={auth.token}
          candidateName={auth.name ?? ''}
          jobRole={auth.jobRole ?? ''}
          jobDescription={auth.jobDescription ?? ''}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

export default App
