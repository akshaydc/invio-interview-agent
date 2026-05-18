import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import PageLayout from '../components/PageLayout'

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
  onInternalLoginClick: () => void
  onHome?: () => void
}

export default function JobListings({ onSelectJob, onCandidateLoginClick, onRecruiterLoginClick, onInternalLoginClick, onHome }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get<Job[]>(`${API}/jobs`)
      .then(res => setJobs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageLayout
      navbar={{
        onHome,
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
        onInternalLogin: onInternalLoginClick,
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>Open Positions</h1>
        <p className="muted" style={{ marginTop: 6 }}>
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
    </PageLayout>
  )
}
