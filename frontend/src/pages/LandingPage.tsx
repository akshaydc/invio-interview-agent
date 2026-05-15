import PageLayout from '../components/PageLayout'

type Props = {
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

const FLOW_TILES = [
  { step: '01', title: 'Upload resume', copy: 'Rina reads your PDF or TXT profile.' },
  { step: '02', title: 'Review matches', copy: 'Roles are ranked with reasons and gaps.' },
  { step: '03', title: 'Apply faster', copy: 'Resume details carry into the form.' },
]

export default function LandingPage({ onCandidateLoginClick, onRecruiterLoginClick }: Props) {
  return (
    <PageLayout
      navbar={{
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
      }}
    >
      <section className="landing-shell" aria-label="ASTRA landing">
        <div className="landing-hero">
          <div className="landing-hero__left">
            <div className="landing-kicker">AI Screening, Talent &amp; Recruitment Assistant</div>
            <h1 className="landing-title">ASTRA</h1>
            <p className="landing-copy">
              Rina is ready in the lower-right corner. Start with a resume match for ranked job recommendations,
              or browse every open role from her panel.
            </p>
            <div className="landing-flow-tiles" aria-label="Resume matching steps">
              {FLOW_TILES.map(({ step, title, copy }) => (
                <div className="landing-flow-tile" key={step}>
                  <span className="landing-flow-tile__step">{step}</span>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>
    </PageLayout>
  )
}
