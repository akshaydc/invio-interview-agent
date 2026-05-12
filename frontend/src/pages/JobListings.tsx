import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'

export type Job = {
  id: string
  title: string
  department: string
  location: string
  job_type: string
  experience: string
  description: string
  requirements: string[]
  status: string
  created_at: string
}

type Props = {
  onSelectJob: (job: Job) => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

export default function JobListings({ onSelectJob, onCandidateLoginClick, onRecruiterLoginClick }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get<Job[]>(`${API}/jobs`)
      .then(res => setJobs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="jobs-page">
      <nav className="jobs-nav">
        <span className="jobs-nav-logo">Invio</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={onCandidateLoginClick}>Candidate Login</button>
          <button className="btn btn-primary" onClick={onRecruiterLoginClick}>Recruiter Login</button>
        </div>
      </nav>

      <div className="jobs-hero">
        <h1 className="title">Open Positions</h1>
        <p className="subtitle" style={{ marginTop: 8 }}>
          Join our team — find a role that fits your skills and ambitions.
        </p>
      </div>

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>No open positions at the moment.</p>
      ) : (
        <div className="jobs-grid">
          {jobs.map(job => (
            <div key={job.id} className="job-card" onClick={() => onSelectJob(job)}>
              <div>
                <span className="job-dept-badge">{job.department}</span>
              </div>
              <h2 className="job-card-title">{job.title}</h2>
              <div className="job-meta">
                <span className="job-meta-item">{job.location}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.job_type}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.experience}</span>
              </div>
              <p className="job-desc-preview">
                {job.description.slice(0, 100)}{job.description.length > 100 ? '...' : ''}
              </p>
              <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={e => { e.stopPropagation(); onSelectJob(job) }}>
                View &amp; Apply
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
