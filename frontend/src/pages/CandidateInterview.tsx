import { useState, useRef } from 'react'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Stage = 'ready' | 'starting' | 'active' | 'ending' | 'done' | 'error'
type MicStatus = 'idle' | 'recording' | 'processing'

type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  onLogout: () => void
}

export default function CandidateInterview({ token, candidateName, jobRole, onLogout }: Props) {
  const [stage, setStage] = useState<Stage>('ready')
  const [micStatus, setMicStatus] = useState<MicStatus>('idle')
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const sessionIdRef = useRef<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const transcriptListRef = useRef<HTMLDivElement | null>(null)
  const currentQuestionRef = useRef<HTMLDivElement | null>(null)

  function speakQuestion(text: string) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onend = () => setIsAISpeaking(false)
    setIsAISpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  async function startInterview() {
    setStage('starting')
    setErrorMsg('')
    try {
      const res = await axios.post<{ session_id: string; first_question: string }>(
        `${API}/session/start`,
        {},
        { headers: { 'X-Auth-Token': token } }
      )
      sessionIdRef.current = res.data.session_id
      setTranscript([{ q: res.data.first_question, a: '', score: null }])
      setStage('active')
      speakQuestion(res.data.first_question)
    } catch {
      setErrorMsg('Failed to start session. Please try again.')
      setStage('error')
    }
  }

  async function startRecording() {
    if (micStatus !== 'idle' || isAISpeaking || !sessionIdRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setMicStatus('recording')
    } catch {
      setErrorMsg('Microphone access denied.')
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    recorder.onstop = async () => {
      const sid = sessionIdRef.current
      if (!sid) return
      recorder.stream.getTracks().forEach((t) => t.stop())

      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
      setMicStatus('processing')

      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')

        const response = await axios.post<{ response: string; candidate_answer: string }>(
          `${API}/session/${sid}/audio`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )

        const nextQuestion = response.data.response
        const candidateAnswer = response.data.candidate_answer

        setTranscript((prev) => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], a: candidateAnswer },
          { q: nextQuestion, a: '', score: null },
        ])

        speakQuestion(nextQuestion)

        setTimeout(() => {
          if (transcriptListRef.current) {
            transcriptListRef.current.scrollTop = transcriptListRef.current.scrollHeight
          }
          const el = currentQuestionRef.current
          if (el) {
            el.classList.add('question-flash')
            setTimeout(() => el.classList.remove('question-flash'), 1000)
          }
        }, 0)
      } catch {
        setErrorMsg('Failed to process audio. Please try again.')
      } finally {
        setMicStatus('idle')
      }
    }

    recorder.stop()
  }

  async function endInterview() {
    const sid = sessionIdRef.current
    if (!sid) return
    setStage('ending')
    window.speechSynthesis.cancel()
    try {
      await axios.post(`${API}/session/${sid}/end`)
      setStage('done')
    } catch {
      setErrorMsg('Failed to end session. Please try again.')
      setStage('active')
    }
  }

  if (stage === 'done') {
    return (
      <div className="page">
        <div className="thankyou-card">
          <div className="thankyou-check-circle">
            <span className="thankyou-checkmark">✓</span>
          </div>
          <h1 className="thankyou-heading">Interview Complete</h1>
          <p className="thankyou-sub">
            Thank you for taking the time to interview with us. Our team will carefully
            review your responses and get back to you.
          </p>
          <hr className="thankyou-divider" />
          <p className="thankyou-next-label">What happens next?</p>
          <ol className="thankyou-steps">
            {['Our team reviews your scorecard', 'We compare with other candidates', 'You will hear from us soon'].map((step, i) => (
              <li key={i} className="thankyou-step">
                <span className="thankyou-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <button className="btn btn-secondary thankyou-btn" onClick={onLogout}>
            Exit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="header">
        <h1 className="title">Invio</h1>
        <p className="subtitle">AI Interview Portal</p>
      </div>

      {stage === 'ready' && (
        <div className="card center-card">
          <h2 style={{ color: 'var(--text)' }}>Welcome, {candidateName}</h2>
          <p className="muted">You are interviewing for:</p>
          <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '1.1rem' }}>{jobRole}</p>
          <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            When you are ready, click Start. The AI interviewer will ask you questions via voice.
            Hold the microphone button to record your answers.
          </p>
          <button className="btn btn-primary" onClick={startInterview}>
            Start Interview
          </button>
        </div>
      )}

      {stage === 'starting' && (
        <div className="card center-card">
          <p className="muted">Connecting to session...</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="card center-card">
          <p className="error-text">{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => setStage('ready')}>Try Again</button>
        </div>
      )}

      {(stage === 'active' || stage === 'ending') && (
        <div className="interview-layout">
          <div className="card status-card">
            <span className="status-dot" />
            <span>Interview in progress · {candidateName} · {jobRole}</span>
          </div>

          {transcript.length > 0 && (
            <div className="current-question" ref={currentQuestionRef}>
              <p className="current-question-label">Current Question</p>
              <p className="current-question-text">{transcript[transcript.length - 1].q}</p>
            </div>
          )}

          <div className="card transcript-card">
            <h3>Transcript</h3>
            {transcript.slice(0, -1).length === 0 ? (
              <p className="muted">Answered questions will appear here.</p>
            ) : (
              <div className="transcript-list" ref={transcriptListRef}>
                {transcript.slice(0, -1).map((entry, i) => (
                  <div key={i} className="transcript-entry">
                    <p className="transcript-q"><strong>Q:</strong> {entry.q}</p>
                    {entry.a && <p className="transcript-a"><strong>A:</strong> {entry.a}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMsg && <p className="interview-error">{errorMsg}</p>}

          <div className="mic-section">
            <p className="mic-hint">
              {isAISpeaking ? 'AI is speaking...' : 'Hold the button and speak your answer'}
            </p>
            <button
              className={`btn-mic btn-mic--${micStatus}`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); startRecording() }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
              disabled={micStatus === 'processing' || stage === 'ending' || isAISpeaking}
            >
              {micStatus === 'recording' && 'Recording...'}
              {micStatus === 'processing' && 'Processing...'}
              {micStatus === 'idle' && <><span>🎤</span> Hold to Speak</>}
            </button>
          </div>

          <button
            className="btn btn-danger"
            onClick={endInterview}
            disabled={stage === 'ending' || micStatus !== 'idle'}
          >
            {stage === 'ending' ? 'Ending...' : 'End Interview'}
          </button>
        </div>
      )}
    </div>
  )
}
