import { useState } from 'react'
import LandingPage from './pages/LandingPage'
import JobListings, { type Job } from './pages/JobListings'
import JobMatches, { type ResumeMatchResult, type JobMatch } from './pages/JobMatches'
import JobDetail from './pages/JobDetail'
import ApplicationForm from './pages/ApplicationForm'
import CandidateLogin from './pages/CandidateLogin'
import RecruiterLogin from './pages/RecruiterLogin'
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
  status?: string
}

type ApplicationPrefill = {
  jobId: string
  jobTitle: string
  resumeFile: File
  currentRole?: string
  matchData?: JobMatch
}

type Page =
  | 'landing'
  | 'job-listings'
  | 'job-detail'
  | 'application-form'
  | 'job-matches'
  | 'candidate-login'
  | 'recruiter-login'
  | 'recruiter-dashboard'
  | 'recruiter-scorecard'
  | 'candidate-interview'

const WIDE_PAGES: Page[] = ['landing', 'job-listings', 'job-detail', 'application-form', 'job-matches']
const DASH_PAGES: Page[] = ['recruiter-dashboard', 'recruiter-scorecard']

function App() {
  const [page, setPage] = useState<Page>('landing')
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [scorecardCt, setScorecardCt] = useState<string>('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [resumeMatch, setResumeMatch] = useState<ResumeMatchResult | null>(null)
  const [applicationPrefill, setApplicationPrefill] = useState<ApplicationPrefill | null>(null)

  function handleLogin(info: AuthInfo) {
    setAuth(info)
    setPage(info.role === 'recruiter' ? 'recruiter-dashboard' : 'candidate-interview')
  }

  function handleLogout() {
    setAuth(null)
    setPage('landing')
  }

  function handleViewScorecard(ctNumber: string) {
    setScorecardCt(ctNumber)
    setPage('recruiter-scorecard')
  }

  function handleSelectJob(job: Job) {
    setSelectedJob(job)
    setPage('job-detail')
  }

  function handleMatchResult(result: ResumeMatchResult) {
    setResumeMatch(result)
    setPage('job-matches')
  }

  function handleApplyFromMatch(jobId: string, jobTitle: string, matchData: JobMatch) {
    setApplicationPrefill({
      jobId,
      jobTitle,
      resumeFile: resumeMatch!.resume_file,
      currentRole: resumeMatch?.candidate_profile.current_role,
      matchData,
    })
    setPage('application-form')
  }

  const isWide = WIDE_PAGES.includes(page)
  const isDash = DASH_PAGES.includes(page)

  return (
    <div className="app" style={
      isDash ? { maxWidth: '1400px' } :
      isWide ? { maxWidth: '1100px' } : {}
    }>
      {page === 'landing' && (
        <LandingPage
          onMatchResult={handleMatchResult}
          onBrowseAll={() => setPage('job-listings')}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
        />
      )}

      {page === 'job-listings' && (
        <JobListings
          onSelectJob={handleSelectJob}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
        />
      )}

      {page === 'job-matches' && resumeMatch && (
        <JobMatches
          matchResult={resumeMatch}
          onApply={handleApplyFromMatch}
          onBrowseAll={() => setPage('job-listings')}
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

      {page === 'application-form' && (selectedJob || applicationPrefill) && (
        <ApplicationForm
          jobId={applicationPrefill?.jobId ?? selectedJob!.id}
          jobTitle={applicationPrefill?.jobTitle ?? selectedJob!.title}
          onBack={() => {
            if (applicationPrefill) { setPage('job-matches') }
            else { setPage('job-detail') }
          }}
          onApplied={() => {
            setApplicationPrefill(null)
            setResumeMatch(null)
            setPage('job-listings')
          }}
          prefill={applicationPrefill ? {
            resumeFile: applicationPrefill.resumeFile,
            currentRole: applicationPrefill.currentRole,
            matchData: applicationPrefill.matchData,
          } : undefined}
        />
      )}

      {page === 'candidate-login' && (
        <CandidateLogin
          onLogin={handleLogin}
          onBack={() => setPage('landing')}
        />
      )}

      {page === 'recruiter-login' && (
        <RecruiterLogin
          onLogin={handleLogin}
          onBack={() => setPage('landing')}
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
          candidateStatus={auth.status ?? 'applied'}
          ctNumber={auth.ctNumber ?? ''}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

export default App
