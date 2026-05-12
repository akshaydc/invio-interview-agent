type Props = {
  onReset: () => void
}

const steps = [
  'Our team reviews your scorecard',
  'We compare with other candidates',
  'You will hear from us soon',
]

export default function Scorecard({ onReset }: Props) {
  return (
    <div className="page">
      <div className="thankyou-card">
        <div className="thankyou-check-circle">
          <span className="thankyou-checkmark">✓</span>
        </div>

        <h1 className="thankyou-heading">Interview Complete</h1>
        <p className="thankyou-sub">
          Thank you for taking the time to interview with us. Our team will carefully
          review your responses and get back to you.
        </p>

        <hr className="thankyou-divider" />

        <p className="thankyou-next-label">What happens next?</p>
        <ol className="thankyou-steps">
          {steps.map((step, i) => (
            <li key={i} className="thankyou-step">
              <span className="thankyou-step-num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <button className="btn btn-primary thankyou-btn" onClick={onReset}>
          Start New Interview
        </button>
      </div>
    </div>
  )
}
