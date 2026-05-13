import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Stage = 'ready' | 'starting' | 'active' | 'ending' | 'error'
type ListenStatus = 'listening' | 'recording' | 'processing' | 'ai_speaking'
type Violation = { type: string; timestamp: string; reason?: string }

type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  onDone: () => void
}

const SPEAK_THRESHOLD = 0.015
const MIN_AUDIO_BYTES = 2000
const END_LOCKOUT_MS = 5 * 60 * 1000

export default function InterviewRoom({ token, candidateName, jobRole, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('ready')
  const [listenStatus, setListenStatus] = useState<ListenStatus>('listening')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [proctorEndMsg, setProctorEndMsg] = useState('')
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [violations, setViolations] = useState<Violation[]>([])
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [endLockout, setEndLockout] = useState(true)
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(END_LOCKOUT_MS / 1000)

  const sessionIdRef = useRef<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const proctorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isAISpeakingRef = useRef(false)
  const stageRef = useRef<Stage>('ready')
  const listenStatusRef = useRef<ListenStatus>('listening')
  const violationsRef = useRef<Violation[]>([])
  const transcriptListRef = useRef<HTMLDivElement | null>(null)
  const currentQuestionRef = useRef<HTMLDivElement | null>(null)
  const startTimeRef = useRef(0)
  const endingRef = useRef(false)
  const shouldAutoEndRef = useRef(false)
  const sampleCountRef = useRef(0)
  const consecutiveAboveRef = useRef(0)
  const consecutiveSilentRef = useRef(0)

  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => { listenStatusRef.current = listenStatus }, [listenStatus])
  useEffect(() => { violationsRef.current = violations }, [violations])

  // biome-ignore lint/correctness/useExhaustiveDependencies: addViolation is stable within the session
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
      if (next.length === 3) setShowWarningModal(true)
      // Defer auto-end to next pollAudio tick to avoid calling async from inside state updater
      if (next.length >= 5 && stageRef.current === 'active') {
        shouldAutoEndRef.current = true
      }
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
      consecutiveAboveRef.current = 0
      consecutiveSilentRef.current = 0
      setListenStatus('listening')
      listenStatusRef.current = 'listening'
    }
    window.speechSynthesis.speak(utterance)
  }

  function setupAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    console.log('AudioContext created, state:', ctx.state)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    console.log('Analyser connected, fftSize:', analyser.fftSize)
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
    // Check deferred violation auto-end first
    if (shouldAutoEndRef.current && stageRef.current === 'active' && !endingRef.current) {
      shouldAutoEndRef.current = false
      setProctorEndMsg('Interview ended due to proctoring violations.')
      endInterview()
      return
    }

    const analyser = analyserRef.current
    if (!analyser) return
    if (isAISpeakingRef.current) { setVolumeLevel(0); return }
    if (listenStatusRef.current === 'processing') return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128
      sum += val * val
    }
    const rms = Math.sqrt(sum / dataArray.length)
    setVolumeLevel(Math.min(rms / SPEAK_THRESHOLD, 1))

    sampleCountRef.current++
    if (sampleCountRef.current % 10 === 0) {
      console.log('Current RMS volume:', rms.toFixed(5), 'Threshold:', SPEAK_THRESHOLD.toFixed(5))
    }

    if (listenStatusRef.current === 'listening') {
      if (rms > SPEAK_THRESHOLD) {
        consecutiveAboveRef.current++
        if (consecutiveAboveRef.current >= 3) {
          consecutiveAboveRef.current = 0
          consecutiveSilentRef.current = 0
          console.log('SPEAKING DETECTED - starting recording')
          setListenStatus('recording')
          listenStatusRef.current = 'recording'
          if (streamRef.current) startNewRecorder(streamRef.current)
        }
      } else {
        consecutiveAboveRef.current = 0
      }
    } else if (listenStatusRef.current === 'recording') {
      if (rms < SPEAK_THRESHOLD) {
        consecutiveSilentRef.current++
        if (consecutiveSilentRef.current >= 20) {
          consecutiveSilentRef.current = 0
          stopAndSend()
        }
      } else {
        consecutiveSilentRef.current = 0
        console.log('SPEAKING - RMS:', rms.toFixed(5), 'above threshold:', SPEAK_THRESHOLD.toFixed(5))
      }
    }
  }

  function stopAndSend() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setListenStatus('processing')
    listenStatusRef.current = 'processing'

    recorder.onstop = async () => {
      const sid = sessionIdRef.current
      if (!sid || audioChunksRef.current.length === 0) {
        consecutiveAboveRef.current = 0
        consecutiveSilentRef.current = 0
        setListenStatus('listening')
        listenStatusRef.current = 'listening'
        return
      }
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      audioChunksRef.current = []
      console.log('SILENCE DETECTED - sending audio, size:', blob.size)

      // Discard audio that's too short to be real speech
      if (blob.size < MIN_AUDIO_BYTES) {
        consecutiveAboveRef.current = 0
        consecutiveSilentRef.current = 0
        setListenStatus('listening')
        listenStatusRef.current = 'listening'
        return
      }

      try {
        const fd = new FormData()
        fd.append('audio', blob, 'recording.webm')
        const res = await axios.post<{ response: string; candidate_answer: string; auto_end?: boolean }>(
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

        if (res.data.auto_end) {
          setTimeout(() => endInterview(), 4000)
          return
        }
      } catch {
        consecutiveAboveRef.current = 0
        consecutiveSilentRef.current = 0
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

  function startLockoutCountdown() {
    startTimeRef.current = Date.now()
    setEndLockout(true)
    setLockoutSecsLeft(END_LOCKOUT_MS / 1000)
    lockoutTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, END_LOCKOUT_MS - elapsed)
      setLockoutSecsLeft(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        setEndLockout(false)
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      }
    }, 1000)
  }

  async function startInterview() {
    setStage('starting')
    setErrorMsg('')
    setProctorEndMsg('')
    consecutiveAboveRef.current = 0
    consecutiveSilentRef.current = 0
    shouldAutoEndRef.current = false

    console.log('Requesting microphone...')
    const stream = await (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        console.log('Microphone access granted (audio + video)')
        return s
      } catch { /* fall through to audio-only */ }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        console.log('Microphone access granted (audio only)')
        return s
      } catch { return null }
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
      sampleCountRef.current = 0
      console.log('Audio detection started automatically (session:', res.data.session_id, ')')
      pollIntervalRef.current = setInterval(pollAudio, 100)
      proctorIntervalRef.current = setInterval(captureProctorFrame, 3000)
      startLockoutCountdown()
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
    if (lockoutTimerRef.current) { clearInterval(lockoutTimerRef.current); lockoutTimerRef.current = null }
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
    if (endingRef.current) return
    endingRef.current = true
    const sid = sessionIdRef.current
    if (!sid) { endingRef.current = false; return }
    setStage('ending')
    stageRef.current = 'ending'
    cleanup()

    const doEnd = async (): Promise<boolean> => {
      try {
        await axios.post(
          `${API}/session/${sid}/end`,
          { violations: violationsRef.current },
          { headers: { 'X-Auth-Token': token } }
        )
        return true
      } catch {
        return false
      }
    }

    if (await doEnd()) {
      onDone()
      return
    }

    // Retry once after 2 seconds
    setTimeout(async () => {
      if (await doEnd()) {
        onDone()
      } else {
        endingRef.current = false
        setErrorMsg('Failed to end session. Please try again.')
        setStage('active')
        stageRef.current = 'active'
      }
    }, 2000)
  }

  const lockoutMins = Math.floor(lockoutSecsLeft / 60)
  const lockoutSecs = lockoutSecsLeft % 60
  const lockoutDisplay = `${lockoutMins}:${String(lockoutSecs).padStart(2, '0')}`

  return (
    <div className="page">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="camera-self-view" style={{ display: cameraActive ? 'flex' : 'none' }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
      </div>

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

          <div className="audio-visualizer">
            {[0.35, 0.65, 1.0, 0.65, 0.35].map((scale, i) => (
              <div
                key={i}
                className={`audio-bar${listenStatus === 'recording' ? ' audio-bar--active' : ''}`}
                style={{ height: `${Math.max(4, volumeLevel * scale * 52)}px` }}
              />
            ))}
          </div>

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

          {proctorEndMsg && (
            <p style={{ color: 'var(--red)', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>
              {proctorEndMsg}
            </p>
          )}
          {errorMsg && <p className="interview-error">{errorMsg}</p>}

          <button
            className="btn btn-danger"
            onClick={() => endInterview()}
            disabled={stage === 'ending' || listenStatus === 'processing' || endLockout}
          >
            {stage === 'ending'
              ? 'Ending…'
              : endLockout
              ? `End Interview (${lockoutDisplay})`
              : 'End Interview'}
          </button>
        </div>
      )}
    </div>
  )
}
