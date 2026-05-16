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
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('rina_muted') === 'true')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isMutedRef = useRef(isMuted)
  const hasPlayedRef = useRef(false)

  async function playLine(text: string) {
    if (isMutedRef.current) return
    try {
      const response = await fetch(`${API}/rina/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error('TTS failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.volume = isMutedRef.current ? 0 : 1
      await audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch {
      if (!isMutedRef.current && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.88
        utterance.pitch = 1.1
        window.speechSynthesis.speak(utterance)
      }
    }
  }

  // Play audio once on mount (line 1 immediately, line 2 after 4s)
  useEffect(() => {
    if (isMutedRef.current || hasPlayedRef.current) return
    hasPlayedRef.current = true
    playLine(RINA_LINES[0])
    const timer = setTimeout(() => {
      playLine(RINA_LINES[1])
    }, 4000)
    return () => {
      clearTimeout(timer)
      if (audioRef.current) audioRef.current.pause()
      window.speechSynthesis?.cancel()
    }
  }, []) // intentionally runs once

  // Text cycling — continuous, for visual animation
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentLine(prev => (prev + 1) % 2)
        setVisible(true)
      }, 400)
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  function toggleMute() {
    const next = !isMuted
    setIsMuted(next)
    isMutedRef.current = next
    localStorage.setItem('rina_muted', String(next))
    if (next) {
      if (audioRef.current) audioRef.current.volume = 0
      window.speechSynthesis?.cancel()
    } else {
      if (audioRef.current) audioRef.current.volume = 1
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

  const uploadBorderColor = error
    ? '#fca5a5'
    : resumeFile && !loading
      ? '#86efac'
      : '#B5D4F4'

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
        }}
      >
        {isMuted ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
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
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '16px 20px',
          border: `1px solid ${uploadBorderColor}`,
          boxShadow: '0 4px 20px rgba(12,68,124,0.08)',
          cursor: loading ? 'wait' : 'pointer',
          transition: 'border-color 0.2s',
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : resumeFile ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
          <div>
            <div style={{ fontSize: 14, color: loading ? '#64748b' : resumeFile ? '#0F6E56' : '#042C53', fontWeight: 500 }}>
              {loading
                ? 'Finding your matches...'
                : resumeFile
                  ? resumeFile.name
                  : 'Drop your resume here or click to upload'}
            </div>
            {!loading && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                PDF or TXT · AI matches you instantly
              </div>
            )}
          </div>
        </div>
        {error && (
          <p style={{ fontSize: 12, color: '#A32D2D', marginTop: 8, marginBottom: 0 }}>{error}</p>
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
