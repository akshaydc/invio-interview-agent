import { useEffect, useRef, useState } from 'react'
import type { AuthInfo } from '../App'
import tobyAvatar from '../assets/toby-avatar.svg'

type GuidePage =
  | 'job-listings'
  | 'job-detail'
  | 'application-form'
  | 'candidate-login'
  | 'recruiter-login'
  | 'recruiter-dashboard'
  | 'recruiter-scorecard'
  | 'candidate-interview'

type Props = {
  page: GuidePage
  auth: AuthInfo | null
  selectedJobTitle?: string
}

const GUIDE_COPY: Record<GuidePage, string[]> = {
  'job-listings': [
    'Hi, I am Toby. I will guide you through Invio. Pick a role to see the details, or sign in if you already have a CT number.',
    'Recruiters can jump into the dashboard from the top right.',
  ],
  'job-detail': [
    'This is the role briefing. Check the requirements, then apply when it feels like a fit.',
    'Your resume helps the recruiter compare your profile against this job.',
  ],
  'application-form': [
    'Fill in the essentials and attach your resume. Invio will generate your candidate tracking number after you apply.',
    'Use your current details here so the recruiter can judge role, compensation, and notice fit.',
  ],
  'candidate-login': [
    'Enter your CT number to return to your application and interview status.',
    'If your interview is scheduled, this login takes you straight to the interview room.',
  ],
  'recruiter-login': [
    'Recruiter access opens the candidate pipeline, job controls, and scorecards.',
    'After login, start with the candidates tab to review matches and interview progress.',
  ],
  'recruiter-dashboard': [
    'This is mission control. Review candidates, schedule interviews, and inspect AI match signals.',
    'Use the jobs tab to create or update roles before inviting more candidates.',
  ],
  'recruiter-scorecard': [
    'Here is the interview scorecard. Look at the summary, strengths, and red flags before deciding next steps.',
    'Use Back when you are ready to return to the recruiter dashboard.',
  ],
  'candidate-interview': [
    'I will stay nearby while the interview runs. Answer naturally and use the mic control when you are ready.',
    'Keep your camera and mic available during the interview so the session can proceed smoothly.',
  ],
}

function getGreeting(page: GuidePage, auth: AuthInfo | null, selectedJobTitle?: string) {
  if (page === 'candidate-interview' && auth?.name) return `Hi ${auth.name}, I am Toby`
  if (page === 'job-detail' && selectedJobTitle) return `Toby for ${selectedJobTitle}`
  if (page === 'recruiter-dashboard') return 'Toby, Recruiter Guide'
  return 'Hi, I am Toby'
}

function buildSpokenMessage(title: string, tip: string) {
  return tip.startsWith('Hi, I am Toby') ? tip : `${title}. ${tip}`
}

function tuneGuideVoice(utterance: SpeechSynthesisUtterance) {
  const voices = window.speechSynthesis.getVoices()
  const preferredVoice = voices.find((voice) =>
    /female|zira|aria|jenny|samantha|google us english/i.test(`${voice.name} ${voice.voiceURI}`),
  )

  if (preferredVoice) utterance.voice = preferredVoice
  utterance.rate = 0.94
  utterance.pitch = 1.08
  utterance.volume = 0.86
}

export default function AvatarGuide({ page, auth, selectedJobTitle }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [tipState, setTipState] = useState({ page, index: 0 })
  const [speaking, setSpeaking] = useState(false)
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

  useEffect(() => {
    if (collapsed || lastSpokenRef.current === spokenMessage) return
    lastSpokenRef.current = spokenMessage
    const timer = window.setTimeout(() => {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(spokenMessage)
      tuneGuideVoice(utterance)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    }, 450)

    return () => window.clearTimeout(timer)
  }, [collapsed, spokenMessage])

  if (collapsed) {
    return (
      <button
        className="avatar-guide avatar-guide--collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Open Invio guide"
      >
        <img className="avatar-guide__image avatar-guide__image--collapsed" src={tobyAvatar} alt="" />
      </button>
    )
  }

  return (
    <aside className={`avatar-guide${speaking ? ' avatar-guide--speaking' : ''}`} aria-label="Invio guide">
      <div className="avatar-guide__character" aria-hidden="true">
        <img className="avatar-guide__image" src={tobyAvatar} alt="" />
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
            aria-label="Stop Toby and hide guide"
          >
            x
          </button>
        </div>
        <p className="avatar-guide__message">{tips[tipIndex]}</p>
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
