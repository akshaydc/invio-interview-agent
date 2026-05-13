import { useState, useRef } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import type { ResumeMatchResult } from './JobMatches'

type Props = {
  onMatchResult: (result: ResumeMatchResult) => void
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

export default function LandingPage({ onMatchResult, onBrowseAll, onCandidateLoginClick, onRecruiterLoginClick }: Props) {
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFindMatches() {
    if (!resumeFile) { setError('Please select a resume file first.'); return }
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('resume', resumeFile)
      const res = await axios.post<Omit<ResumeMatchResult, 'resume_file'>>(
        `${API}/resume/match`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
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

  return (
    <div className="jobs-page">
      <nav className="jobs-nav">
        <div>
          <span className="jobs-nav-logo">Invio</span>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>AI Interview Portal</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={onCandidateLoginClick}>Candidate Login</button>
          <button className="btn btn-primary" onClick={onRecruiterLoginClick}>Recruiter Login</button>
        </div>
      </nav>

      <div className="jobs-hero">
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Find your perfect role
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: '1rem', maxWidth: 520, margin: '12px auto 0' }}>
          Upload your resume and let AI match you with the right opportunities — or browse all open positions.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24,
        maxWidth: 760,
        margin: '0 auto',
        padding: '0 0 60px',
      }}>
        {/* Smart Match card */}
        <div className="card" style={{
          border: '2px solid var(--primary)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{
            position: 'absolute', top: -13, left: 20,
            background: 'var(--primary)', color: '#fff',
            fontSize: '0.7rem', fontWeight: 700, padding: '2px 12px',
            borderRadius: 20, letterSpacing: '0.06em',
          }}>
            RECOMMENDED
          </div>
          <div style={{ fontSize: '2rem', marginTop: 8 }}>✨</div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Match me with jobs
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Upload your resume and our AI will instantly find roles that match your skills and experience.
            </p>
          </div>

          <div
            className="resume-upload-area"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              style={{ display: 'none' }}
              onChange={e => { setResumeFile(e.target.files?.[0] ?? null); setError('') }}
            />
            {resumeFile
              ? <span style={{ color: 'var(--text)' }}>{resumeFile.name}</span>
              : <span style={{ color: 'var(--muted)' }}>Click to upload resume (PDF or TXT)…</span>
            }
          </div>

          {resumeFile && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, textAlign: 'left' }}
              onClick={() => setResumeFile(null)}
            >
              Remove file
            </button>
          )}

          {error && <p className="field-error">{error}</p>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: 'auto' }}
            onClick={handleFindMatches}
            disabled={loading || !resumeFile}
          >
            {loading ? 'Analysing resume…' : 'Find my matches'}
          </button>
        </div>

        {/* Browse All card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: '2rem' }}>🔍</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Browse all openings
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Explore all open positions and apply to the ones that interest you.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', padding: '12px', marginTop: 'auto' }}
            onClick={onBrowseAll}
          >
            View all jobs
          </button>
        </div>
      </div>
    </div>
  )
}
