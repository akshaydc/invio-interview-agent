import { useState } from 'react'
import InterviewRoom from '../components/InterviewRoom'
import PageLayout from '../components/PageLayout'
import WaitingRoom from './WaitingRoom'

type CandidateStatus = 'not_started' | 'applied' | 'shortlisted' | 'interview_scheduled' | 'interview_complete' | 'rejected' | string

type Props = {
  token: string
  candidateName: string
  jobRole: string
  jobDescription: string
  candidateStatus: CandidateStatus
  ctNumber: string
  interviewSlot?: string
  onLogout: () => void
}

function getSecondsUntilSlot(slot: string): number {
  try {
    const [datePart, timePart] = slot.split(' ')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    return Math.floor((new Date(year, month - 1, day, hour, minute).getTime() - Date.now()) / 1000)
  } catch {
    return -1
  }
}

const DOS = [
  'Ensure you are in a quiet environment',
  'Speak clearly and at a moderate pace',
  'Look directly at the camera while answering',
  'Take a moment to think before answering',
  'Give structured, specific answers with examples',
  'Have your resume nearby for reference',
  'Ensure good lighting on your face',
  'Test your microphone before starting',
]

const DONTS = [
  'Do not use external help or notes',
  'Do not have another person in the room',
  'Do not switch browser tabs during interview',
  'Do not use your phone during the interview',
  'Do not interrupt the AI interviewer',
  'Do not use offensive or unprofessional language',
  'Do not close the browser during the interview',
]

export default function CandidateInterview({
  token,
  candidateName,
  jobRole,
  jobDescription,
  candidateStatus,
  interviewSlot,
  onLogout,
}: Props) {
  const [interviewDone, setInterviewDone] = useState(false)
  const [slotOverride, setSlotOverride] = useState(false)
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false)
  const [guidelinesChecked, setGuidelinesChecked] = useState(false)

  const effectiveStatus: CandidateStatus = interviewDone ? 'interview_complete' : candidateStatus

  const navRight = (
    <>
      {candidateName && (
        <span className="muted" style={{ fontSize: '0.875rem', paddingRight: 8 }}>{candidateName}</span>
      )}
      <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
    </>
  )

  if (effectiveStatus === 'rejected') {
    return (
      <PageLayout navbar={{ rightContent: navRight }}>
        <div className="thankyou-card" style={{ margin: '0 auto' }}>
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
          <button className="btn btn-secondary thankyou-btn" onClick={onLogout}>Exit</button>
        </div>
      </PageLayout>
    )
  }

  if (effectiveStatus === 'interview_complete') {
    return (
      <PageLayout navbar={{ rightContent: navRight }}>
        <div className="thankyou-card" style={{ margin: '0 auto' }}>
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
          <button className="btn btn-secondary thankyou-btn" onClick={onLogout}>Exit</button>
        </div>
      </PageLayout>
    )
  }

  if (effectiveStatus === 'interview_scheduled') {
    const tooEarly = interviewSlot && !slotOverride && getSecondsUntilSlot(interviewSlot) > 120
    if (tooEarly) {
      return (
        <WaitingRoom
          candidateName={candidateName}
          interviewSlot={interviewSlot!}
          token={token}
          onStartInterview={() => setSlotOverride(true)}
          onLogout={onLogout}
        />
      )
    }

    if (!guidelinesAccepted) {
      return (
        <PageLayout navbar={{ rightContent: navRight }}>
          <div className="card" style={{ maxWidth: 760, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ color: 'var(--text)', marginBottom: 4 }}>Before you begin</h2>
              <p className="muted" style={{ fontSize: '0.9rem' }}>Please read these guidelines carefully</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <h3 style={{ color: 'var(--green)', marginBottom: 12, fontSize: '1rem' }}>✅ Do&apos;s</h3>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DOS.map((item, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--green)', flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 style={{ color: 'var(--red)', marginBottom: 12, fontSize: '1rem' }}>❌ Don&apos;ts</h3>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DONTS.map((item, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--red)', flexShrink: 0 }}>✗</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={{
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              borderRadius: 8,
              padding: '12px 16px',
              color: 'var(--text)',
              fontSize: '0.875rem',
              lineHeight: 1.6,
            }}>
              ℹ The interview will last approximately 10 minutes. You will be asked several questions
              and the AI will assess your responses. Your camera and microphone will be active throughout.
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={guidelinesChecked}
                onChange={e => setGuidelinesChecked(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
              I have read and agree to the interview guidelines
            </label>

            <button
              className="btn btn-primary"
              style={{ fontSize: '1rem', padding: '12px 32px', alignSelf: 'flex-start', opacity: guidelinesChecked ? 1 : 0.5, cursor: guidelinesChecked ? 'pointer' : 'not-allowed' }}
              disabled={!guidelinesChecked}
              onClick={() => guidelinesChecked && setGuidelinesAccepted(true)}
            >
              Start Interview →
            </button>
          </div>
        </PageLayout>
      )
    }

    return (
      <PageLayout navbar={{ rightContent: navRight }}>
        <InterviewRoom
          token={token}
          candidateName={candidateName}
          jobRole={jobRole}
          jobDescription={jobDescription}
          onDone={() => setInterviewDone(true)}
        />
      </PageLayout>
    )
  }

  // applied / shortlisted / not_started / any other status → waiting screen
  return (
    <PageLayout navbar={{ rightContent: navRight }}>
      <div className="card center-card">
        <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>⏳</div>
        <h2 style={{ color: 'var(--text)' }}>Application Under Review</h2>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          Hi {candidateName}, your application has been received. Our recruiting team is reviewing
          your profile and will schedule your interview once shortlisted.
        </p>
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          You&apos;ll receive a notification when your interview is scheduled. Please check back here
          using your CT number.
        </p>
        <button className="btn btn-secondary" onClick={onLogout} style={{ marginTop: 8 }}>
          Exit
        </button>
      </div>
    </PageLayout>
  )
}
