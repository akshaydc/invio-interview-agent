import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import type { ResumeMatchResult } from '../pages/JobMatches'

const RINA_LINES = [
  "Hi, I'm Rina — your AI assistant. Welcome to ASTRA.",
  "Upload your resume, and let me do my magic to fetch you the right roles.",
]

const GESTURES = [
  'rinaGesture1 3.5s ease-in-out',
  'rinaGesture2 3.5s ease-in-out',
]

type Props = {
  onMatchResult?: (result: ResumeMatchResult) => void
  onBrowseRoles?: () => void
}

export default function RinaSpeaking({ onMatchResult, onBrowseRoles }: Props) {
  const [currentLine, setCurrentLine] = useState(0)
  const [visible, setVisible] = useState(true)
  const [isMuted, setIsMuted] = useState(
    localStorage.getItem('rina_muted') === 'true'
  )
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadHovered, setUploadHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Text cycling — driven by 'rina-line' events dispatched from index.html script
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setVisible(false)
      setTimeout(() => {
        setCurrentLine(e.detail.line)
        setVisible(true)
      }, 400)
    }
    window.addEventListener('rina-line', handler as EventListener)
    return () => window.removeEventListener('rina-line', handler as EventListener)
  }, [])

  function toggleMute() {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    if (newMuted) {
      window.speechSynthesis.cancel()
      localStorage.setItem('rina_muted', 'true')
    } else {
      localStorage.setItem('rina_muted', 'false')
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeFile(file)
    setError('')
    if (!onMatchResult) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('resume', file)
      const res = await axios.post<Omit<ResumeMatchResult, 'resume_file'>>(
        `${API}/resume/match`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      onMatchResult({ ...res.data, resume_file: file })
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? 'Failed to analyse resume.'
        : 'Failed to analyse resume.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16, position: 'relative' }}>
      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        title={isMuted ? 'Unmute Rina' : 'Mute Rina'}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid #e2e8f0',
          background: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          padding: 0,
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* Avatar */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <img
          key={currentLine}
          src="/rina-avatar.webp"
          alt="Rina, AI recruitment assistant"
          style={{
            height: '100%',
            maxHeight: 420,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            animation: GESTURES[currentLine],
          }}
        />
      </div>

      {/* Subtitle bar */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: '16px 20px',
        border: '1px solid #B5D4F4',
        boxShadow: '0 4px 20px rgba(12,68,124,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={visible ? 'rina-dot rina-dot--active' : 'rina-dot'}
              style={{ animationDelay: visible ? `${i * 150}ms` : '0ms' }}
            />
          ))}
        </div>
        <p style={{
          fontSize: 15,
          color: '#042C53',
          fontFamily: 'Space Grotesk, sans-serif',
          lineHeight: 1.5,
          opacity: visible ? 1 : 0,
          transition: 'opacity 400ms ease',
          margin: 0,
        }}>
          {RINA_LINES[currentLine]}
        </p>
      </div>

      {/* Upload box */}
      <div
        onClick={() => !loading && fileInputRef.current?.click()}
        onMouseEnter={() => setUploadHovered(true)}
        onMouseLeave={() => setUploadHovered(false)}
        style={{
          background: uploadHovered && !loading
            ? 'linear-gradient(135deg, #185FA5 0%, #378ADD 100%)'
            : 'linear-gradient(135deg, #0C447C 0%, #185FA5 100%)',
          borderRadius: 14,
          padding: '20px 24px',
          border: 'none',
          boxShadow: uploadHovered && !loading
            ? '0 12px 40px rgba(12, 68, 124, 0.35)'
            : '0 8px 32px rgba(12, 68, 124, 0.25)',
          cursor: loading ? 'wait' : 'pointer',
          transform: uploadHovered && !loading ? 'translateY(-2px)' : 'none',
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : resumeFile ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
          <div>
            <div style={{ fontSize: 15, color: 'white', fontWeight: 600 }}>
              {loading
                ? 'Finding your matches...'
                : resumeFile
                  ? resumeFile.name
                  : 'Drop your resume here or click to upload'}
            </div>
            {!loading && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                PDF or TXT · AI matches you instantly
              </div>
            )}
          </div>
        </div>
        {error && (
          <p style={{ fontSize: 12, color: 'rgba(255,200,200,0.9)', marginTop: 8, marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {/* Browse link */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>or</span>
        <br />
        <button
          onClick={onBrowseRoles}
          style={{
            background: 'none',
            border: 'none',
            color: '#0C447C',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Browse all open positions →
        </button>
      </div>
    </div>
  )
}
