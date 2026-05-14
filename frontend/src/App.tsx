import { useState } from 'react'
import AstraIntro from './components/AstraIntro'
import LandingPage from './pages/LandingPage'
import JobListings, { type Job } from './pages/JobListings'
import JobMatches, { type ResumeMatchResult, type JobMatch, type PrefillInfo } from './pages/JobMatches'
import JobDetail from './pages/JobDetail'
import ApplicationForm from './pages/ApplicationForm'
import CandidateLogin from './pages/CandidateLogin'
import RecruiterLogin from './pages/RecruiterLogin'
import RecruiterDashboard from './pages/RecruiterDashboard'
import ScorecardView from './pages/ScorecardView'
import CandidateInterview from './pages/CandidateInterview'
import BookSlot from './pages/BookSlot'
import AvatarGuide from './components/AvatarGuide'
import './index.css'

const ASTRA_INTRO_STORAGE_KEY = 'astra_intro_seen_enterprise_v2'

export type AuthInfo = {
  token: string
  role: 'recruiter' | 'candidate'
  name?: string
  ctNumber?: string
  jobRole?: string
  jobDescription?: string
  status?: string
  interviewSlot?: string
}

type ApplicationPrefill = {
  jobId: string
  jobTitle: string
  resumeFile: File
  name?: string
  email?: string
  phone?: string
  linkedinUrl?: string
  currentRole?: string
  location?: string
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
  | 'book-slot'


function App() {
  const [introSeen, setIntroSeen] = useState(() => {
    const forceIntro = new URLSearchParams(window.location.search).get('intro') === '1'
    return !forceIntro && localStorage.getItem(ASTRA_INTRO_STORAGE_KEY) === '1'
  })
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/book-slot' ? 'book-slot' : 'landing'
  )
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [scorecardCt, setScorecardCt] = useState<string>('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [resumeMatch, setResumeMatch] = useState<ResumeMatchResult | null>(null)
  const [applicationPrefill, setApplicationPrefill] = useState<ApplicationPrefill | null>(null)
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([])

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

  function handleApplyFromMatch(jobId: string, jobTitle: string, matchData: JobMatch, prefillData: PrefillInfo) {
    setApplicationPrefill({
      jobId,
      jobTitle,
      resumeFile: resumeMatch!.resume_file,
      name: prefillData.name || undefined,
      email: prefillData.email || undefined,
      phone: prefillData.phone || undefined,
      linkedinUrl: prefillData.linkedin_url || undefined,
      currentRole: prefillData.current_role || undefined,
      location: prefillData.location || undefined,
      matchData,
    })
    setPage('application-form')
  }

  return (
    <>
      {!introSeen && (
        <AstraIntro onComplete={() => {
          localStorage.removeItem('astra_intro_seen')
          localStorage.setItem(ASTRA_INTRO_STORAGE_KEY, '1')
          setIntroSeen(true)
        }} />
      )}
      <div className="app">
      {page === 'landing' && (
        <LandingPage          onBrowseAll={() => setPage('job-listings')}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
        />
      )}

      {page === 'job-listings' && (
        <JobListings
          onSelectJob={handleSelectJob}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
          onHome={() => setPage('landing')}
        />
      )}

      {page === 'job-matches' && resumeMatch && (
        <JobMatches
          matchResult={resumeMatch}
          appliedJobIds={appliedJobIds}
          onApply={handleApplyFromMatch}
          onBrowseAll={() => setPage('job-listings')}
          onCandidateLoginClick={() => setPage('candidate-login')}
          onRecruiterLoginClick={() => setPage('recruiter-login')}
          onHome={() => setPage('landing')}
        />
      )}

      {page === 'job-detail' && selectedJob && (
        <JobDetail
          job={selectedJob}
          onApply={() => setPage('application-form')}
          onBack={() => setPage('job-listings')}
          onHome={() => setPage('landing')}
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
            const fromMatch = !!applicationPrefill?.matchData
            const appliedId = applicationPrefill?.jobId
            setApplicationPrefill(null)
            if (fromMatch && appliedId) {
              setAppliedJobIds(prev => [...prev, appliedId])
              setPage('job-matches')
            } else {
              setResumeMatch(null)
              setPage('job-listings')
            }
          }}
          prefill={applicationPrefill ? {
            resumeFile: applicationPrefill.resumeFile,
            name: applicationPrefill.name,
            email: applicationPrefill.email,
            phone: applicationPrefill.phone,
            linkedinUrl: applicationPrefill.linkedinUrl,
            currentRole: applicationPrefill.currentRole,
            location: applicationPrefill.location,
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

      {page === 'book-slot' && <BookSlot />}

      {page === 'candidate-interview' && auth && (
        <CandidateInterview
          token={auth.token}
          candidateName={auth.name ?? ''}
          jobRole={auth.jobRole ?? ''}
          jobDescription={auth.jobDescription ?? ''}
          candidateStatus={auth.status ?? 'applied'}
          ctNumber={auth.ctNumber ?? ''}
          interviewSlot={auth.interviewSlot}
          onLogout={handleLogout}
        />
      )}

      {introSeen && (
        <AvatarGuide
          page={page}
          auth={auth}
          selectedJobTitle={selectedJob?.title}
          onBrowseAllOpenings={() => setPage('job-listings')}
          onMatchResult={handleMatchResult}
        />
      )}
    </div>
    </>
  )
}

export default App

