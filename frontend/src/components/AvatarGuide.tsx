import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { AuthInfo } from '../App'
import type { ResumeMatchResult } from '../pages/JobMatches'
import { API_BASE_URL as API } from '../config'
import rinaAvatar from '../assets/rina-avatar.png'

type GuidePage =
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

type Props = {
  page: GuidePage
  auth: AuthInfo | null
  selectedJobTitle?: string
  onBrowseAllOpenings?: () => void
  onMatchResult?: (result: ResumeMatchResult) => void
}

const GUIDE_COPY: Record<GuidePage, string[]> = {
  'landing': [
    'Welcome to ASTRA. I can match your resume to the strongest roles, or open the full jobs board when you want to browse manually.',
    'Choose a starting point below. I will keep the flow ready and stay with you on every page.',
  ],
  'job-matches': [
    'These roles are ranked against your resume. Start with the strongest match, then compare the reasons and gaps.',
    'When a role looks right, apply from here and I will carry the resume details into the form.',
  ],
  'job-listings': [
    'These are all current openings. Select a role to review the details, or return home when you want the resume match flow.',
    'Recruiters can sign in from the top navigation to manage candidates, jobs, and scorecards.',
  ],
  'job-detail': [
    'This is the role briefing. Review the responsibilities, requirements, and location before you apply.',
    'When the fit looks good, start the application and attach the right resume for this role.',
  ],
  'application-form': [
    'Complete the application details carefully. The recruiter uses this information with your resume match signals.',
    'Use your current compensation, expected compensation, and notice period so the fit assessment is accurate.',
  ],
  'candidate-login': [
    'Enter your CT number to return to your application and interview status.',
    'If your interview is scheduled, this login takes you straight into the interview room.',
  ],
  'recruiter-login': [
    'Recruiter access opens the candidate pipeline, job controls, and scorecards.',
    'After login, start with the candidates tab to review matches and interview progress.',
  ],
  'recruiter-dashboard': [
    'This is your hiring control room. Review candidates, schedule interviews, and inspect AI match signals.',
    'Use the jobs tab to create or update roles before inviting more candidates.',
  ],
  'recruiter-scorecard': [
    'This scorecard summarizes the interview outcome, strengths, and risk signals for the candidate.',
    'Use Back when you are ready to return to the recruiter dashboard.',
  ],
  'candidate-interview': [
    'I will stay nearby while the interview runs. Answer naturally and keep your microphone and camera available.',
    'The interviewer asks questions by voice. Take a breath, then answer clearly when prompted.',
  ],
  'book-slot': [
    'Select a date and time that works best for you. All slots are between 9 AM and 6 PM.',
    'Once you confirm, you will receive a confirmation email with your login details.',
  ],
}

function getGreeting(page: GuidePage, auth: AuthInfo | null, selectedJobTitle?: string) {
  if (page === 'candidate-interview' && auth?.name) return `Rina with ${auth.name}`
  if (page === 'job-detail' && selectedJobTitle) return `Rina for ${selectedJobTitle}`
  if (page === 'recruiter-dashboard') return 'Rina, Recruiter Guide'
  return 'Greetings I am Rina, ASTRA Guide'
}

function buildSpokenMessage(title: string, tip: string) {
  return `${title}. ${tip}`
}

function femaleVoiceScore(voice: SpeechSynthesisVoice) {
  const label = `${voice.name} ${voice.voiceURI}`.toLowerCase()
  if (/male|david|mark|guy|daniel|george|alex|fred|ralph|bruce|tom|google uk english male/.test(label)) return -1
  if (/zira|aria|jenny|samantha|susan|victoria|karen|moira|tessa|serena|fiona|ava|allison|salli|joanna|kendra|kimberly|ivy/.test(label)) return 3
  if (/female|woman|girl|google uk english female/.test(label)) return 2
  return 0
}

function getPreferredFemaleVoice(voices: SpeechSynthesisVoice[]) {
  return voices
    .filter((voice) => /english|en-/i.test(`${voice.lang} ${voice.name}`))
    .map((voice) => ({ voice, score: femaleVoiceScore(voice) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.voice
}

function getVoicesWhenReady() {
  const currentVoices = window.speechSynthesis.getVoices()
  if (currentVoices.length > 0) return Promise.resolve(currentVoices)

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timeout = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }, 1200)

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeout)
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

function tuneGuideVoice(utterance: SpeechSynthesisUtterance, voices: SpeechSynthesisVoice[]) {
  const preferredVoice = getPreferredFemaleVoice(voices)

  if (preferredVoice) utterance.voice = preferredVoice
  utterance.rate = 0.96
  utterance.pitch = preferredVoice ? 1.12 : 1.34
  utterance.volume = 0.9
}

export default function AvatarGuide({ page, auth, selectedJobTitle, onBrowseAllOpenings, onMatchResult }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [tipState, setTipState] = useState({ page, index: 0 })
  const [speaking, setSpeaking] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastSpokenRef = useRef('')

  const tips = GUIDE_COPY[page]
  const title = getGreeting(page, auth, selectedJobTitle)
  const tipIndex = tipState.page === page ? tipState.index : 0
  const currentTip = tips[tipIndex]
  const spokenMessage = buildSpokenMessage(title, currentTip)

  function stopSpeaking() {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  async function handleFindMatches() {
    if (!resumeFile) {
      setError('Upload a PDF or TXT resume first.')
      return
    }
    if (!onMatchResult) return

    setError('')
    setLoading(true)
    stopSpeaking()
    try {
      const fd = new FormData()
      fd.append('resume', resumeFile)
      const res = await axios.post<Omit<ResumeMatchResult, 'resume_file'>>(
        `${API}/resume/match`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      onMatchResult({ ...res.data, resume_file: resumeFile })
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? 'Failed to analyse resume.'
        : 'Failed to analyse resume.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setCollapsed(false)
    setTipState({ page, index: 0 })
    lastSpokenRef.current = ''
  }, [page])

  useEffect(() => {
    if (collapsed || lastSpokenRef.current === spokenMessage) return
    lastSpokenRef.current = spokenMessage
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const voices = await getVoicesWhenReady()
      if (cancelled) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(spokenMessage)
      tuneGuideVoice(utterance, voices)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    }, 420)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [collapsed, spokenMessage])

  if (collapsed) {
    return (
      <button
        className="avatar-guide avatar-guide--collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Open ASTRA guide"
      >
        <img className="avatar-guide__image avatar-guide__image--collapsed" src={rinaAvatar} alt="" />
      </button>
    )
  }

  return (
    <aside className={`avatar-guide${speaking ? ' avatar-guide--speaking' : ''}${page === 'landing' ? ' avatar-guide--landing' : ''}`} aria-label="ASTRA guide">
      <div className="avatar-guide__character" aria-hidden="true">
        <img className="avatar-guide__image" src={rinaAvatar} alt="" />
      </div>

      <div className="avatar-guide__bubble">
        <div className="avatar-guide__topline">
          <p className="avatar-guide__title">{title}</p>
          <button
            className="avatar-guide__close"
            onClick={(event) => {
              event.stopPropagation()
              stopSpeaking()
              setCollapsed(true)
            }}
            aria-label="Stop Rina and hide guide"
          >
            x
          </button>
        </div>
        <p className="avatar-guide__message">{currentTip}</p>

        {page === 'landing' && (
          <div className="avatar-guide__choice-panel">
            <div className="avatar-guide__choice-header">
              <span>Start with Rina</span>
              <strong>Resume match or full job list</strong>
            </div>

            <button
              className="avatar-guide__upload"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="avatar-guide__upload-icon">+</span>
              <span>
                <strong>{resumeFile ? resumeFile.name : 'Upload resume'}</strong>
                <small>PDF or TXT for matched roles</small>
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              className="avatar-guide__file-input"
              onChange={(event) => {
                setResumeFile(event.target.files?.[0] ?? null)
                setError('')
              }}
            />

            {error && <p className="avatar-guide__error">{error}</p>}

            <div className="avatar-guide__choice-actions">
              <button
                className="avatar-guide__primary"
                type="button"
                onClick={handleFindMatches}
                disabled={loading || !resumeFile}
              >
                {loading ? 'Matching...' : 'Match me with jobs'}
              </button>
              <button
                className="avatar-guide__secondary"
                type="button"
                onClick={() => {
                  stopSpeaking()
                  onBrowseAllOpenings?.()
                }}
              >
                Browse all openings
              </button>
            </div>
          </div>
        )}

        <div className="avatar-guide__actions">
          <span className="avatar-guide__step">
            {tipIndex + 1}/{tips.length}
          </span>
          <button
            className="avatar-guide__next"
            onClick={(event) => {
              event.stopPropagation()
              stopSpeaking()
              setTipState({ page, index: (tipIndex + 1) % tips.length })
            }}
          >
            Next
          </button>
        </div>
      </div>
    </aside>
  )
}
