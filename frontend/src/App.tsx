import { useState } from 'react'
import RecruiterDashboard from './pages/RecruiterDashboard'
import CandidateInterview from './pages/CandidateInterview'
import ScorecardView from './pages/ScorecardView'
import JobListings, { type Job } from './pages/JobListings'
import JobDetail from './pages/JobDetail'
import ApplicationForm from './pages/ApplicationForm'
import CandidateLogin from './pages/CandidateLogin'
import RecruiterLogin from './pages/RecruiterLogin'
import './index.css'

export type AuthInfo = {
  token: string
  role: 'recruiter' | 'candidate'
  name?: string
  ctNumber?: string
  jobRole?: string
  jobDescription?: string
}

type Page =
  | 'job-listings'
  | 'job-detail'
  | 'application-form'
  | 'candidate-login'
  | 'recruiter-login'
  | 'recruiter-dashboard'
  | 'recruiter-scorecard'
  | 'candidate-interview'

const WIDE_PAGES: Page[] = ['job-listings', 'job-detail', 'application-form']

function App() {
  const [page, setPage] = useState<Page>('job-listings')
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [scorecardCt, setScorecardCt] = useState<string>('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  function handleLogin(info: AuthInfo) {
    setAuth(info)
    setPage(info.role === 'recruiter' ? 'recruiter-dashboard' : 'candidate-interview')
  }

  function handleLogout() {
    setAuth(null)
    setPage('job-listings')
  }

  function handleViewScorecard(ctNumber: string) {
    setScorecardCt(ctNumber)
    setPage('recruiter-scorecard')
  }

  function handleSelectJob(job: Job) {
    setSelectedJob(job)
    setPage('job-detail')
  }

  return (
    <div className="app" style={WIDE_PAGES.includes(page) ? { maxWidth: '1100px' } : {}}>
      {page === 'job-listings' && (
        <JobListings
          onSelectJob={handleSelectJob}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
        />
      )}

      {page === 'job-detail' && selectedJob && (
        <JobDetail
          job={selectedJob}
          onApply={() => setPage('application-form')}
          onBack={() => setPage('job-listings')}
        />
      )}

      {page === 'application-form' && selectedJob && (
        <ApplicationForm
          jobId={selectedJob.id}
          jobTitle={selectedJob.title}
          onBack={() => setPage('job-detail')}
        />
      )}

      {page === 'candidate-login' && (
        <CandidateLogin
          onLogin={handleLogin}
          onBack={() => setPage('job-listings')}
        />
      )}

      {page === 'recruiter-login' && (
        <RecruiterLogin
          onLogin={handleLogin}
          onBack={() => setPage('job-listings')}
        />
      )}

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
