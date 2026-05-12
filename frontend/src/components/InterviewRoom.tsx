import { useState, useRef } from 'react'
import axios from 'axios'
import type { ScorecardData } from '../App'

const API = 'http://127.0.0.1:8000'

type TranscriptEntry = { q: string; a: string; score: number | null }

type Props = {
  onEnd: (sessionId: string, scorecard: ScorecardData) => void
}

type Status = 'idle' | 'starting' | 'active' | 'ending' | 'error'
type MicStatus = 'idle' | 'recording' | 'processing'

export default function InterviewRoom({ onEnd }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [micStatus, setMicStatus] = useState<MicStatus>('idle')
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedRole, setSelectedRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')
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
    setStatus('starting')
    setErrorMsg('')
    try {
      const res = await axios.post<{ session_id: string; first_question: string }>(
        `${API}/session/start`,
        { job_role: customRole.trim() || selectedRole, job_description: jobDescription }
      )
      sessionIdRef.current = res.data.session_id
      setTranscript([{ q: res.data.first_question, a: '', score: null }])
      setStatus('active')
      speakQuestion(res.data.first_question)
    } catch {
      setErrorMsg('Failed to start session. Is the backend running?')
      setStatus('error')
    }
  }

  async function startRecording() {
    if (micStatus !== 'idle' || !sessionIdRef.current) return
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
    setStatus('ending')
    try {
      const res = await axios.post<{ scorecard: ScorecardData; transcript: TranscriptEntry[] }>(
        `${API}/session/${sid}/end`
      )
      const scorecard = res.data.scorecard ?? res.data
      onEnd(sid, scorecard as ScorecardData)
    } catch {
      setErrorMsg('Failed to end session. Please try again.')
      setStatus('active')
    }
  }

  return (
    <div className="page">
      <div className="header">
        <h1 className="title">Invio - The Interview Agent</h1>
        <p className="subtitle">Kaplan - Hackathon Solution</p>
      </div>

      {status === 'idle' && (
        <div className="card center-card">
          <h2>Ready to begin?</h2>
          <p>Select a role or type a custom one, then start your interview.</p>
          <div className="role-select-group">
            <label className="role-label">Job Role</label>
            <select
              className="role-select"
              value={selectedRole}
              onChange={(e) => { setSelectedRole(e.target.value); setCustomRole('') }}
            >
              <option>Software Engineer</option>
              <option>Frontend Developer</option>
              <option>Backend Developer</option>
              <option>Full Stack Developer</option>
              <option>Salesforce Administrator</option>
              <option>Product Manager</option>
              <option>Salesforce Developer</option>
              <option>QA Engineer</option>
            </select>
            <label className="role-label">Or type a custom role</label>
            <input
              className="role-input"
              type="text"
              placeholder="e.g. DevOps Engineer"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
            />
          </div>
          <div className="role-select-group">
            <label className="role-label">Add Job Description (optional but recommended)</label>
            <textarea
              className="role-textarea"
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={startInterview}>
            Start Interview
          </button>
        </div>
      )}

      {status === 'starting' && (
        <div className="card center-card">
          <p className="muted">Connecting to session...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="card center-card">
          <p className="error-text">{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => setStatus('idle')}>
            Try Again
          </button>
        </div>
      )}

      {(status === 'active' || status === 'ending') && (
        <div className="interview-layout">
          <div className="card status-card">
            <span className="status-dot" />
            <span>Interview in progress...</span>
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
                    {entry.score !== null && <p className="transcript-score">Score: {entry.score}/10</p>}
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
              disabled={micStatus === 'processing' || status === 'ending' || isAISpeaking}
            >
              {micStatus === 'recording' && 'Recording...'}
              {micStatus === 'processing' && 'Processing...'}
              {micStatus === 'idle' && <><span>🎤</span> Hold to Speak</>}
            </button>
          </div>

          <button
            className="btn btn-danger"
            onClick={endInterview}
            disabled={status === 'ending' || micStatus !== 'idle'}
          >
            {status === 'ending' ? 'Ending...' : 'End Interview'}
          </button>
        </div>
      )}
    </div>
  )
}
