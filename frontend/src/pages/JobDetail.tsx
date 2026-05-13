import type { Job } from './JobListings'

type Props = {
  job: Job
  onApply: () => void
  onBack: () => void
  onHome?: () => void
}

export default function JobDetail({ job, onApply, onBack, onHome }: Props) {
  return (
    <div className="page">
      <div className="dash-header">
        <div onClick={onHome} style={{ cursor: onHome ? 'pointer' : 'default' }}>
          <div className="jobs-nav-logo">ASTRA</div>
          <div className="jobs-nav-tagline">AI Screening, Talent &amp; Recruitment Assistant</div>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>Back to Jobs</button>
      </div>

      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <span className="job-dept-badge">{job.department}</span>
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
          {job.title}
        </h1>
        <div className="job-meta" style={{ marginBottom: 24 }}>
          <span className="job-meta-item">{job.location}</span>
          <span className="job-meta-sep">·</span>
          <span className="job-meta-item">{job.job_type}</span>
          <span className="job-meta-sep">·</span>
          <span className="job-meta-item">{job.experience}</span>
        </div>

        <p className="role-label" style={{ marginBottom: 8 }}>About the Role</p>
        <p style={{ color: 'var(--text)', lineHeight: 1.8, marginBottom: 28 }}>
          {job.description}
        </p>

        <p className="role-label" style={{ marginBottom: 12 }}>Requirements</p>
        <ul className="job-requirements">
          {job.requirements.map((req, i) => (
            <li key={i} className="job-req-tag">{req}</li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 16 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '14px 56px', fontSize: '1.05rem' }}
          onClick={onApply}
        >
          Apply Now
        </button>
      </div>
    </div>
  )
}
