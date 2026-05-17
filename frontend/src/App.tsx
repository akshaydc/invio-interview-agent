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
import CandidateDashboard from './pages/CandidateDashboard'
import BookSlot from './pages/BookSlot'
import AvatarGuide from './components/AvatarGuide'
import './index.css'

const ASTRA_INTRO_STORAGE_KEY = 'astra_intro_seen_enterprise_v3'

export type Application = {
  job_id: string
  job_title?: string
  job_role?: string
  job_description?: string
  status?: string
  interview_slot?: string
  session_id?: string | null
  match_percentage?: number | null
  match_summary?: string
  match_strengths?: string[]
  match_gaps?: string[]
  recommendation?: string
  compensation_fit?: string
  notice_fit?: string
  applied_at?: string
  shortlisted_at?: string
  scheduled_at?: string
  withdrawn_at?: string
  slot_booking_token?: string | null
}

export type AuthInfo = {
  token: string
  role: 'recruiter' | 'candidate'
  name?: string
  ctNumber?: string
  applications?: Application[]
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
  | 'candidate-dashboard'
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
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [returnedFromJobDetail, setReturnedFromJobDetail] = useState(false)

  function handleLogin(info: AuthInfo) {
    setAuth(info)
    setReturnedFromJobDetail(false)
    setPage(info.role === 'recruiter' ? 'recruiter-dashboard' : 'candidate-dashboard')
  }

  function handleLogout() {
    setAuth(null)
    setSelectedApplication(null)
    setReturnedFromJobDetail(false)
    setPage('landing')
  }

  function handleViewScorecard(ctNumber: string) {
    setScorecardCt(ctNumber)
    setReturnedFromJobDetail(false)
    setPage('recruiter-scorecard')
  }

  function handleSelectJob(job: Job) {
    setSelectedJob(job)
    setReturnedFromJobDetail(false)
    setPage('job-detail')
  }

  function handleMatchResult(result: ResumeMatchResult) {
    setResumeMatch(result)
    setReturnedFromJobDetail(false)
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

  function handleStartInterview(app: Application) {
    setSelectedApplication(app)
    setPage('candidate-interview')
  }

  return (
    <>
      {!introSeen && (
        <AstraIntro onComplete={() => {
          localStorage.removeItem('astra_intro_seen')
          localStorage.removeItem('astra_intro_seen_enterprise_v2')
          localStorage.setItem(ASTRA_INTRO_STORAGE_KEY, '1')
          setIntroSeen(true)
        }} />
      )}

      <div className="app">
      {page === 'landing' && (
        <LandingPage
          onBrowseAll={() => {
            setReturnedFromJobDetail(false)
            setPage('job-listings')
          }}
          onCandidateLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('candidate-login')
          }}
          onRecruiterLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('recruiter-login')
          }}
        />
      )}

      {page === 'job-listings' && (
        <JobListings
          onSelectJob={handleSelectJob}
          onCandidateLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('candidate-login')
          }}
          onRecruiterLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('recruiter-login')
          }}
          onHome={() => {
            setReturnedFromJobDetail(false)
            setPage('landing')
          }}
        />
      )}

      {page === 'job-matches' && resumeMatch && (
        <JobMatches
          matchResult={resumeMatch}
          onApply={handleApplyFromMatch}
          onBrowseAll={() => {
            setReturnedFromJobDetail(false)
            setPage('job-listings')
          }}
          onCandidateLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('candidate-login')
          }}
          onRecruiterLoginClick={() => {
            setReturnedFromJobDetail(false)
            setPage('recruiter-login')
          }}
          onHome={() => {
            setReturnedFromJobDetail(false)
            setPage('landing')
          }}
        />
      )}

      {page === 'job-detail' && selectedJob && (
        <JobDetail
          job={selectedJob}
          onApply={() => setPage('application-form')}
          onBack={() => {
            setReturnedFromJobDetail(true)
            setPage('job-listings')
          }}
          onHome={() => {
            setReturnedFromJobDetail(false)
            setPage('landing')
          }}
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
          onApplied={(_ctNumber, _jobTitle) => {
            const fromMatch = !!applicationPrefill?.matchData
            const appliedId = applicationPrefill?.jobId ?? selectedJob?.id ?? ''
            setApplicationPrefill(null)
            if (fromMatch && appliedId) {
              setPage('job-matches')
            } else {
              setResumeMatch(null)
              setReturnedFromJobDetail(false)
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

      {page === 'candidate-dashboard' && auth && (
        <CandidateDashboard
          token={auth.token}
          candidateName={auth.name ?? ''}
          ctNumber={auth.ctNumber ?? ''}
          initialApplications={auth.applications ?? []}
          onLogout={handleLogout}
          onStartInterview={handleStartInterview}
        />
      )}

      {page === 'candidate-interview' && auth && selectedApplication && (
        <CandidateInterview
          token={auth.token}
          candidateName={auth.name ?? ''}
          jobRole={selectedApplication.job_role ?? selectedApplication.job_title ?? ''}
          jobDescription={selectedApplication.job_description ?? ''}
          candidateStatus={selectedApplication.status ?? 'applied'}
          ctNumber={auth.ctNumber ?? ''}
          interviewSlot={selectedApplication.interview_slot}
          onLogout={() => setPage('candidate-dashboard')}
        />
      )}

        {introSeen && (
          <AvatarGuide
            page={page}
            auth={auth}
            selectedJobTitle={selectedJob?.title}
            selectedJobDepartment={selectedJob?.department}
            selectedJobDescription={selectedJob?.description}
            selectedJobRequirements={selectedJob?.requirements}
            returnedFromJobDetail={returnedFromJobDetail}
            onBrowseAllOpenings={() => {
              setReturnedFromJobDetail(false)
              setPage('job-listings')
            }}
            onMatchResult={handleMatchResult}
          />
        )}
      </div>
    </>
  )
}

export default App
