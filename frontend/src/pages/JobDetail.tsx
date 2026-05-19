import type { Job } from './JobListings'
import PageLayout from '../components/PageLayout'

type Props = {
  job: Job
  onApply: () => void
  onBack: () => void
  onHome?: () => void
}

export default function JobDetail({ job, onApply, onBack, onHome }: Props) {
  return (
    <PageLayout
      navbar={{
        onHome,
        rightContent: (
          <button className="btn btn-secondary" onClick={onBack}>Back to Jobs</button>
        ),
      }}
    >
      <div className="card">
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="job-dept-badge">{job.department}</span>
          {job.job_code && (
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
              Job ID: {job.job_code}
            </span>
          )}
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

        {(job.must_have_skills?.length || job.good_to_have_skills?.length) ? (
          <>
            {job.must_have_skills && job.must_have_skills.length > 0 && (
              <>
                <p className="role-label" style={{ marginBottom: 8 }}>
                  Must-Have Skills
                  <span style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: 10, marginLeft: 8 }}>Required</span>
                </p>
                <ul className="job-requirements" style={{ marginBottom: 16 }}>
                  {job.must_have_skills.map((s, i) => (
                    <li key={i} className="job-req-tag" style={{ borderColor: '#FCA5A5', color: '#B91C1C', background: '#FFF5F5' }}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {job.good_to_have_skills && job.good_to_have_skills.length > 0 && (
              <>
                <p className="role-label" style={{ marginBottom: 8 }}>
                  Good-to-Have Skills
                  <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: 10, marginLeft: 8 }}>Optional</span>
                </p>
                <ul className="job-requirements">
                  {job.good_to_have_skills.map((s, i) => (
                    <li key={i} className="job-req-tag" style={{ borderColor: '#93C5FD', color: '#1D4ED8', background: '#EFF6FF' }}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <>
            <p className="role-label" style={{ marginBottom: 12 }}>Requirements</p>
            <ul className="job-requirements">
              {job.requirements.map((req, i) => (
                <li key={i} className="job-req-tag">{req}</li>
              ))}
            </ul>
          </>
        )}
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
    </PageLayout>
  )
}
