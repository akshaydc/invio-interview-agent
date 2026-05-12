import { useState } from 'react'
import InterviewRoom from '../components/InterviewRoom'

type CandidateStatus = 'not_started' | 'applied' | 'interview_scheduled' | 'interview_complete' | 'rejected' | string

type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  candidateStatus: CandidateStatus
  ctNumber: string
  onLogout: () => void
}

export default function CandidateInterview({
  token,
  candidateName,
  jobRole,
  jobDescription,
  candidateStatus,
  onLogout,
}: Props) {
  const [interviewDone, setInterviewDone] = useState(false)

  const effectiveStatus: CandidateStatus = interviewDone ? 'interview_complete' : candidateStatus

  if (effectiveStatus === 'rejected') {
    return (
      <div className="page">
        <div className="thankyou-card">
          <div style={{ fontSize: '2.5rem' }}>✕</div>
          <h1 className="thankyou-heading" style={{ color: 'var(--red)' }}>Application Unsuccessful</h1>
          <p className="thankyou-sub">
            Thank you for your interest in this role. After careful consideration, we've decided to
            move forward with other candidates whose experience more closely matches our current needs.
          </p>
          <hr className="thankyou-divider" />
          <p className="thankyou-sub" style={{ fontSize: '0.875rem' }}>
            We encourage you to apply for future opportunities that match your skills and experience.
            We appreciate the time you invested in your application.
          </p>
          <button className="btn btn-secondary thankyou-btn" onClick={onLogout}>
            Exit
          </button>
        </div>
      </div>
    )
  }

  if (effectiveStatus === 'interview_complete') {
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

  if (effectiveStatus === 'interview_scheduled') {
    return (
      <InterviewRoom
        token={token}
        candidateName={candidateName}
        jobRole={jobRole}
        jobDescription={jobDescription}
        onDone={() => setInterviewDone(true)}
      />
    )
  }

  // applied / not_started / any other status → waiting screen
  return (
    <div className="page">
      <div className="header">
        <h1 className="title">Invio</h1>
        <p className="subtitle">AI Interview Portal</p>
      </div>
      <div className="card center-card">
        <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>⏳</div>
        <h2 style={{ color: 'var(--text)' }}>Application Under Review</h2>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          Hi {candidateName}, your application has been received. Our recruiting team is reviewing
          your profile and will schedule your interview once shortlisted.
        </p>
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          You'll receive a notification when your interview is scheduled. Please check back here
          using your CT number.
        </p>
        <button className="btn btn-secondary" onClick={onLogout} style={{ marginTop: 8 }}>
          Exit
        </button>
      </div>
    </div>
  )
}
