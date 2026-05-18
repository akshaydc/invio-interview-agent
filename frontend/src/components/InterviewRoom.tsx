import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import type { DailyCall } from '@daily-co/daily-js'
import { API_BASE_URL as API } from '../config'

type TranscriptEntry = { q: string; a: string; score: number | null }
type Stage = 'ready' | 'starting' | 'active' | 'ending' | 'error'
type RecordingState = 'listening' | 'speaking' | 'processing' | 'ai_speaking'
type Violation = { type: string; timestamp: string; reason?: string }


type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  onDone: () => void
}

const END_LOCKOUT_MS = 5 * 60 * 1000

export default function InterviewRoom({ token, candidateName, jobRole, jobDescription, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('ready')
  const [recordingState, setRecordingState] = useState<RecordingState>('listening')
  const [, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [proctorEndMsg, setProctorEndMsg] = useState('')
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [violations, setViolations] = useState<Violation[]>([])
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [endLockout, setEndLockout] = useState(true)
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(END_LOCKOUT_MS / 1000)
  const [autoEndMsg, setAutoEndMsg] = useState('')
  const [taraLoaded, setTaraLoaded] = useState<boolean>(false)
  const [taraUrl, setTaraUrl] = useState<string>('')

  const sessionIdRef = useRef<string | null>(null)
  const audioCleanupRef = useRef<(() => void) | null>(null)
  const proctorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const taraContainerRef = useRef<HTMLDivElement | null>(null)
  const taraFrameRef = useRef<DailyCall | null>(null)
  const isAISpeakingRef = useRef(false)
  const stageRef = useRef<Stage>('ready')
  const recordingStateRef = useRef<RecordingState>('listening')
  const violationsRef = useRef<Violation[]>([])
  const startTimeRef = useRef(0)
  const endingRef = useRef(false)
  const shouldAutoEndRef = useRef(false)

  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => { recordingStateRef.current = recordingState }, [recordingState])
  useEffect(() => { violationsRef.current = violations }, [violations])

  useEffect(() => {
    if (!taraUrl || (stage !== 'active' && stage !== 'ending') || !taraContainerRef.current) return

    let disposed = false
    const displayName = candidateName.trim() || 'Candidate'

    async function joinTaraRoom() {
      const { default: DailyIframe } = await import('@daily-co/daily-js')
      if (disposed || !taraContainerRef.current) return

      if (taraFrameRef.current) {
        taraFrameRef.current.destroy()
        taraFrameRef.current = null
      }

      taraContainerRef.current.innerHTML = ''
      const frame = DailyIframe.createFrame(taraContainerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '12px',
        },
        showLeaveButton: false,
        userName: displayName,
      })

      taraFrameRef.current = frame
      frame.on('loaded', () => setTaraLoaded(true))
      frame.on('joined-meeting', () => setTaraLoaded(true))
      await frame.join({ url: taraUrl, userName: displayName })
    }

    joinTaraRoom().catch((err) => {
      console.log('Tara join error:', err)
      if (!disposed) setErrorMsg('Failed to connect to Tara. Please try again.')
    })

    return () => {
      disposed = true
      if (taraFrameRef.current) {
        taraFrameRef.current.destroy()
        taraFrameRef.current = null
      }
    }
  }, [candidateName, stage, taraUrl])

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
      if (next.length >= 5 && stageRef.current === 'active') {
        shouldAutoEndRef.current = true
      }
      return next
    })
  }

  function speakQuestion(text: string) {
    // Tara handles the spoken interview. Keep the legacy browser voice silent.
    void text
    window.speechSynthesis.cancel()
    isAISpeakingRef.current = false
    setRecordingState('listening')
    recordingStateRef.current = 'listening'
  }

  async function sendAudio(blob: Blob) {
    const sid = sessionIdRef.current
    if (!sid) return
    setRecordingState('processing')
    recordingStateRef.current = 'processing'
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

      speakQuestion(nextQuestion)

      if (res.data.auto_end) {
        setAutoEndMsg('Interview complete. Thank you for your time.')
        setTimeout(() => endInterview(), 3000)
      }
    } catch {
      setErrorMsg('Failed to process audio. Please try again.')
      setRecordingState('listening')
      recordingStateRef.current = 'listening'
    }
  }

  async function startContinuousRecording(): Promise<() => void> {
    const THRESHOLD = 0.015
    const SILENCE_DURATION = 1200
    const MIN_SPEECH_DURATION = 400

    console.log('Requesting microphone...')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      console.log('Microphone access granted (audio + video)')
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        console.log('Microphone access granted (audio only)')
      } catch {
        throw new Error('Microphone access is required to start the interview.')
      }
    }

    if (stream.getVideoTracks().length > 0 && videoRef.current) {
      videoRef.current.srcObject = stream
    }

    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    console.log('AudioContext created, state:', audioCtx.state)
    console.log('Analyser connected, fftSize:', analyser.fftSize)

    let isRecording = false
    let silenceStart: number | null = null
    let speechStart: number | null = null
    let mediaRecorder: MediaRecorder | null = null
    let chunks: Blob[] = []

    const tick = () => {
      // Check deferred violation auto-end
      if (shouldAutoEndRef.current && stageRef.current === 'active' && !endingRef.current) {
        shouldAutoEndRef.current = false
        setProctorEndMsg('Interview ended due to proctoring violations.')
        endInterview()
        return
      }

      if (isAISpeakingRef.current) {
        setVolumeLevel(0)
        return
      }
      if (recordingStateRef.current === 'processing') return

      analyser.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128
        sum += val * val
      }
      const rms = Math.sqrt(sum / dataArray.length)
      setVolumeLevel(Math.min(rms / THRESHOLD, 1))

      const now = Date.now()
      const isSpeaking = rms > THRESHOLD

      if (isSpeaking) {
        silenceStart = null
        if (!speechStart) speechStart = now

        if (!isRecording && (now - speechStart) > MIN_SPEECH_DURATION) {
          isRecording = true
          chunks = []
          mediaRecorder = new MediaRecorder(stream)
          mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
          mediaRecorder.start(100)
          setRecordingState('speaking')
          recordingStateRef.current = 'speaking'
          console.log('Recording started, RMS:', rms.toFixed(5))
        } else if (isRecording) {
          console.log('SPEAKING - RMS:', rms.toFixed(5), 'above threshold:', THRESHOLD.toFixed(5))
        }
      } else {
        speechStart = null
        if (isRecording) {
          if (!silenceStart) silenceStart = now
          if ((now - silenceStart) > SILENCE_DURATION) {
            isRecording = false
            silenceStart = null
            const mr = mediaRecorder
            if (mr && mr.state !== 'inactive') {
              mr.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' })
                console.log('Sending audio, size:', blob.size)
                if (blob.size > 2000) {
                  await sendAudio(blob)
                } else {
                  console.log('Audio too small, discarding')
                  setRecordingState('listening')
                  recordingStateRef.current = 'listening'
                }
              }
              mr.stop()
            }
          }
        } else {
          if (
            recordingStateRef.current !== 'ai_speaking' &&
            recordingStateRef.current !== 'listening'
          ) {
            setRecordingState('listening')
            recordingStateRef.current = 'listening'
          }
        }
      }
    }

    console.log('Audio detection started automatically')
    const intervalId = setInterval(tick, 50)

    return () => {
      clearInterval(intervalId)
      stream.getTracks().forEach(t => t.stop())
      if (audioCtx.state !== 'closed') audioCtx.close()
    }
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
    setTaraLoaded(false)
    setStage('starting')
    setErrorMsg('')
    setProctorEndMsg('')
    shouldAutoEndRef.current = false

    let audioCleanup: () => void
    try {
      audioCleanup = await startContinuousRecording()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone access is required to start the interview.')
      setStage('error')
      return
    }
    audioCleanupRef.current = audioCleanup

    try {
      const res = await axios.post<{ session_id: string; first_question: string }>(
        `${API}/session/start`,
        { job_role: jobRole, job_description: jobDescription },
        { headers: { 'X-Auth-Token': token } }
      )
      sessionIdRef.current = res.data.session_id
      setTranscript([{ q: res.data.first_question, a: '', score: null }])
      setStage('active')
      
      // Create Tara CVI avatar session
      try {
        const taraRes = await axios.post(
          `${API}/create-tara-session?job_role=${encodeURIComponent(jobRole)}`
        )
        if (taraRes.data.conversation_url) {
          setTaraUrl(taraRes.data.conversation_url)
        }
      } catch (e) {
        console.log('Tara not available:', e)
      }
      stageRef.current = 'active'
      console.log('Session started:', res.data.session_id)
      proctorIntervalRef.current = setInterval(captureProctorFrame, 3000)
      startLockoutCountdown()
      speakQuestion(res.data.first_question)
    } catch (err) {
      console.log('Start error:', axios.isAxiosError(err) ? err.response?.data : err)
      console.log('Start error status:', axios.isAxiosError(err) ? err.response?.status : 'N/A')
      cleanup()
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail
        if (detail && typeof detail === 'object' && detail.message === 'too_early') {
          setErrorMsg(`Interview not open yet. Scheduled for ${detail.slot}. Try again in ${detail.minutes_remaining} minutes.`)
        } else if (err.response?.status === 401) {
          setErrorMsg('Session expired. Please log out and log in again.')
        } else {
          setErrorMsg(typeof detail === 'string' ? detail : 'Failed to start session. Please try again.')
        }
      } else {
        setErrorMsg('Failed to start session. Please try again.')
      }
      setStage('error')
    }
  }

  function cleanup() {
    if (audioCleanupRef.current) { audioCleanupRef.current(); audioCleanupRef.current = null }
    if (proctorIntervalRef.current) { clearInterval(proctorIntervalRef.current); proctorIntervalRef.current = null }
    if (lockoutTimerRef.current) { clearInterval(lockoutTimerRef.current); lockoutTimerRef.current = null }
    window.speechSynthesis.cancel()
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
      <div className="camera-self-view" style={{ display: 'none' }} aria-hidden="true">
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
          {taraUrl && (
            <div style={{ position: 'relative', width: '100%', height: 'min(68vh, 620px)', minHeight: 460, borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
              <div
                ref={taraContainerRef}
                aria-label="Tara AI Interviewer"
                style={{ width: '100%', height: '100%' }}
              />
              {!taraLoaded && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: '#1a1a2e',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    border: '3px solid #7F77DD',
                    borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <p style={{ color: 'white', fontSize: '16px', margin: 0 }}>Connecting you to Tara...</p>
                  <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Please allow camera and microphone access</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
            </div>
          )}
          {!taraUrl && (
            <div className="card center-card">
              <p className="muted">Connecting you to Tara...</p>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card status-card" style={{ flex: 1 }}>
              <span className="status-dot" />
              <span>Interview in progress · {candidateName} · {jobRole}</span>
            </div>
            <div className={`proctor-badge${violations.length > 0 ? ' proctor-badge--warn' : ''}`}>
              {violations.length === 0 ? '🛡 Monitored' : `⚠ ${violations.length} warning${violations.length !== 1 ? 's' : ''}`}
            </div>
          </div>

          <div className="audio-visualizer">
            {[0.35, 0.65, 1.0, 0.65, 0.35].map((scale, i) => (
              <div
                key={i}
                className={`audio-bar${recordingState === 'speaking' ? ' audio-bar--active' : ''}`}
                style={{ height: `${Math.max(4, volumeLevel * scale * 52)}px` }}
              />
            ))}
          </div>

          <div className="listen-status">
            {recordingState === 'listening' && <span className="listen-text">Listening…</span>}
            {recordingState === 'speaking' && (
              <span className="listen-text listen-text--recording">
                <span className="rec-dot" /> Recording…
              </span>
            )}
            {recordingState === 'processing' && (
              <span className="listen-text listen-text--processing">Processing…</span>
            )}
            {recordingState === 'ai_speaking' && (
              <span className="listen-text listen-text--ai">AI is speaking…</span>
            )}
          </div>

          {proctorEndMsg && (
            <p style={{ color: 'var(--red)', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>
              {proctorEndMsg}
            </p>
          )}
          {autoEndMsg && (
            <p style={{ color: 'var(--green)', fontSize: '1rem', textAlign: 'center', fontWeight: 600, padding: '12px 0' }}>
              {autoEndMsg}
            </p>
          )}
          {errorMsg && <p className="interview-error">{errorMsg}</p>}

          <button
            className="btn btn-danger"
            onClick={() => endInterview()}
            disabled={stage === 'ending' || recordingState === 'processing' || endLockout}
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
