import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Stage = 'ready' | 'starting' | 'active' | 'ending' | 'done' | 'error'
type ListenStatus = 'listening' | 'recording' | 'processing' | 'ai_speaking'
type Violation = { type: string; timestamp: string; reason?: string }

type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  onLogout: () => void
}

const SILENCE_THRESHOLD = 0.01
const SPEAK_DEBOUNCE_MS = 300
const SILENCE_TIMEOUT_MS = 1500

export default function CandidateInterview({ token, candidateName, jobRole, onLogout }: Props) {
  const [stage, setStage] = useState<Stage>('ready')
  const [listenStatus, setListenStatus] = useState<ListenStatus>('listening')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [violations, setViolations] = useState<Violation[]>([])
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const proctorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isAISpeakingRef = useRef(false)
  const stageRef = useRef<Stage>('ready')
  const listenStatusRef = useRef<ListenStatus>('listening')
  const violationsRef = useRef<Violation[]>([])
  const transcriptListRef = useRef<HTMLDivElement | null>(null)
  const currentQuestionRef = useRef<HTMLDivElement | null>(null)
  const speakState = useRef({ firstAbove: 0, lastAbove: 0, capturing: false })

  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => { listenStatusRef.current = listenStatus }, [listenStatus])
  useEffect(() => { violationsRef.current = violations }, [violations])

  // Proctoring: tab switch + window blur detection
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && stageRef.current === 'active') {
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString() })
      }
    }
    function onWindowBlur() {
      if (stageRef.current === 'active') {
        addViolation({ type: 'window_blur', timestamp: new Date().toISOString() })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [])

  useEffect(() => () => cleanup(), [])

  function addViolation(v: Violation) {
    setViolations(prev => {
      const next = [...prev, v]
      violationsRef.current = next
      if (next.length >= 3) setShowWarningModal(true)
      return next
    })
  }

  function speakQuestion(text: string) {
    window.speechSynthesis.cancel()
    isAISpeakingRef.current = true
    setListenStatus('ai_speaking')
    listenStatusRef.current = 'ai_speaking'
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onend = () => {
      isAISpeakingRef.current = false
      speakState.current = { firstAbove: 0, lastAbove: 0, capturing: false }
      setListenStatus('listening')
      listenStatusRef.current = 'listening'
    }
    window.speechSynthesis.speak(utterance)
  }

  function setupAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    audioContextRef.current = ctx
    analyserRef.current = analyser
  }

  function startNewRecorder(stream: MediaStream) {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    audioChunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    recorder.start(100)
    mediaRecorderRef.current = recorder
  }

  function pollAudio() {
    const analyser = analyserRef.current
    if (!analyser) return
    if (isAISpeakingRef.current) { setVolumeLevel(0); return }
    if (listenStatusRef.current === 'processing') return

    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
    setVolumeLevel(Math.min(rms / SILENCE_THRESHOLD, 1))

    const now = Date.now()
    const s = speakState.current

    if (rms > SILENCE_THRESHOLD) {
      if (s.firstAbove === 0) s.firstAbove = now
      s.lastAbove = now
      if (!s.capturing && now - s.firstAbove >= SPEAK_DEBOUNCE_MS) {
        s.capturing = true
        setListenStatus('recording')
        listenStatusRef.current = 'recording'
        if (streamRef.current) startNewRecorder(streamRef.current)
      }
    } else {
      if (s.capturing && now - s.lastAbove >= SILENCE_TIMEOUT_MS) {
        stopAndSend()
      }
      if (!s.capturing) s.firstAbove = 0
    }
  }

  function stopAndSend() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    speakState.current = { firstAbove: 0, lastAbove: 0, capturing: false }
    setListenStatus('processing')
    listenStatusRef.current = 'processing'

    recorder.onstop = async () => {
      const sid = sessionIdRef.current
      if (!sid || audioChunksRef.current.length === 0) {
        setListenStatus('listening')
        listenStatusRef.current = 'listening'
        return
      }
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      audioChunksRef.current = []

      try {
        const fd = new FormData()
        fd.append('audio', blob, 'recording.webm')
        const res = await axios.post<{ response: string; candidate_answer: string }>(
          `${API}/session/${sid}/audio`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        const nextQuestion = res.data.response
        const candidateAnswer = res.data.candidate_answer

        setTranscript(prev => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], a: candidateAnswer },
          { q: nextQuestion, a: '', score: null },
        ])

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

        speakQuestion(nextQuestion)
      } catch {
        setErrorMsg('Failed to process audio. Please try again.')
        setListenStatus('listening')
        listenStatusRef.current = 'listening'
      }
    }
    recorder.stop()
  }

  function captureProctorFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    const sid = sessionIdRef.current
    if (!video || !canvas || !sid || stageRef.current !== 'active') return
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, 320, 240)
    const imageData = canvas.toDataURL('image/jpeg', 0.7)
    axios
      .post(`${API}/session/${sid}/proctor`, { image: imageData })
      .then(res => {
        if (res.data.flag) {
          addViolation({
            type: 'face_detection',
            reason: res.data.reason || 'Unusual activity detected',
            timestamp: new Date().toISOString(),
          })
        }
      })
      .catch(() => {})
  }

  async function startInterview() {
    setStage('starting')
    setErrorMsg('')

    const stream = await (async () => {
      try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: true }) } catch { /* fall through */ }
      try { return await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return null }
    })()

    if (!stream) {
      setErrorMsg('Microphone access is required to start the interview.')
      setStage('error')
      return
    }

    streamRef.current = stream

    if (stream.getVideoTracks().length > 0 && videoRef.current) {
      videoRef.current.srcObject = stream
      setCameraActive(true)
    }
    setupAudio(stream)

    try {
      const res = await axios.post<{ session_id: string; first_question: string }>(
        `${API}/session/start`,
        {},
        { headers: { 'X-Auth-Token': token } }
      )
      sessionIdRef.current = res.data.session_id
      setTranscript([{ q: res.data.first_question, a: '', score: null }])
      setStage('active')
      stageRef.current = 'active'
      pollIntervalRef.current = setInterval(pollAudio, 100)
      proctorIntervalRef.current = setInterval(captureProctorFrame, 3000)
      speakQuestion(res.data.first_question)
    } catch {
      cleanup()
      setErrorMsg('Failed to start session. Please try again.')
      setStage('error')
    }
  }

  function cleanup() {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    if (proctorIntervalRef.current) { clearInterval(proctorIntervalRef.current); proctorIntervalRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }
    window.speechSynthesis.cancel()
    setCameraActive(false)
  }

  async function endInterview() {
    const sid = sessionIdRef.current
    if (!sid) return
    setStage('ending')
    stageRef.current = 'ending'
    cleanup()
    try {
      await axios.post(
        `${API}/session/${sid}/end`,
        { violations: violationsRef.current },
        { headers: { 'X-Auth-Token': token } }
      )
      setStage('done')
    } catch {
      setErrorMsg('Failed to end session. Please try again.')
      setStage('active')
      stageRef.current = 'active'
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
            Thank you for taking the time to interview with us. Our team will carefully review your
            responses and get back to you.
          </p>
          <hr className="thankyou-divider" />
          <p className="thankyou-next-label">What happens next?</p>
          <ol className="thankyou-steps">
            {['Our team reviews your scorecard', 'We compare with other candidates', 'You will hear from us soon'].map(
              (step, i) => (
                <li key={i} className="thankyou-step">
                  <span className="thankyou-step-num">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ),
            )}
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
      {/* Always-present: canvas for proctoring capture, video for camera feed */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="camera-self-view" style={{ display: cameraActive ? 'flex' : 'none' }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
      </div>

      {/* Warning modal */}
      {showWarningModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠</div>
            <h3 style={{ color: 'var(--text)', marginBottom: 12 }}>Suspicious Activity Detected</h3>
            <p className="muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>
              This interview is being monitored. Multiple irregularities have been recorded and will be
              included in your interview report.
            </p>
            <button className="btn btn-primary" onClick={() => setShowWarningModal(false)}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

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
            When you click Start, your microphone and camera will be activated. The AI interviewer will
            ask questions via voice — simply speak your answers naturally. The system detects when you
            start and stop speaking automatically.
          </p>
          <button className="btn btn-primary" onClick={startInterview}>
            Start Interview
          </button>
        </div>
      )}

      {stage === 'starting' && (
        <div className="card center-card">
          <p className="muted">Requesting permissions and connecting...</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="card center-card">
          <p className="error-text">{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => setStage('ready')}>
            Try Again
          </button>
        </div>
      )}

      {(stage === 'active' || stage === 'ending') && (
        <div className="interview-layout">
          {/* Top bar: proctoring status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card status-card" style={{ flex: 1 }}>
              <span className="status-dot" />
              <span>Interview in progress · {candidateName} · {jobRole}</span>
            </div>
            <div className={`proctor-badge${violations.length > 0 ? ' proctor-badge--warn' : ''}`}>
              {violations.length === 0 ? '🛡 Monitored' : `⚠ ${violations.length} warning${violations.length !== 1 ? 's' : ''}`}
            </div>
          </div>

          {transcript.length > 0 && (
            <div className="current-question" ref={currentQuestionRef}>
              <p className="current-question-label">Current Question</p>
              <p className="current-question-text">{transcript[transcript.length - 1].q}</p>
            </div>
          )}

          {/* Audio visualizer */}
          <div className="audio-visualizer">
            {[0.35, 0.65, 1.0, 0.65, 0.35].map((scale, i) => (
              <div
                key={i}
                className={`audio-bar${listenStatus === 'recording' ? ' audio-bar--active' : ''}`}
                style={{ height: `${Math.max(4, volumeLevel * scale * 52)}px` }}
              />
            ))}
          </div>

          {/* Listen status */}
          <div className="listen-status">
            {listenStatus === 'listening' && <span className="listen-text">Listening…</span>}
            {listenStatus === 'recording' && (
              <span className="listen-text listen-text--recording">
                <span className="rec-dot" /> Recording…
              </span>
            )}
            {listenStatus === 'processing' && (
              <span className="listen-text listen-text--muted">Processing…</span>
            )}
            {listenStatus === 'ai_speaking' && (
              <span className="listen-text listen-text--muted">AI is speaking…</span>
            )}
          </div>

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

          <button
            className="btn btn-danger"
            onClick={endInterview}
            disabled={stage === 'ending' || listenStatus === 'processing'}
          >
            {stage === 'ending' ? 'Ending…' : 'End Interview'}
          </button>
        </div>
      )}
    </div>
  )
}
