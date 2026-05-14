import PageLayout from '../components/PageLayout'

type Props = {
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

const STATS = [
  { number: '10x',   label: 'Faster screening vs manual process',   color: '#0C447C' },
  { number: '94%',   label: 'Accuracy in candidate shortlisting',    color: '#0F6E56' },
  { number: '<24h',  label: 'Application to Interview',       color: '#854F0B' },
  { number: '0',     label: 'Recruiter hours for initial screening',  color: '#1d1d1f' },
]

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

          <div className="landing-hero__right">
            <div className="landing-stats-grid">
              {STATS.map(({ number, label, color }) => (
                <div key={label} className="landing-stat-block">
                  <div className="landing-stat-number" style={{ color }}>{number}</div>
                  <div className="landing-stat-label">{label}</div>
                </div>
              ))}
            </div>

            <blockquote className="landing-quote">
              <p className="landing-quote__text">
                &ldquo;ASTRA screened 40 candidates in the time it would have taken us to review 5 resumes.&rdquo;
              </p>
              <p className="landing-quote__attribution">&mdash; HR Lead</p>
            </blockquote>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
