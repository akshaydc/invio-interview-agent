import PageLayout from '../components/PageLayout'
import RinaSpeaking from '../components/RinaSpeaking'
import type { ResumeMatchResult } from './JobMatches'

type Props = {
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
  onMatchResult?: (result: ResumeMatchResult) => void
}

const FLOW_TILES = [
  { step: '01', title: 'Upload resume', copy: 'Rina reads your profile.' },
  { step: '02', title: 'Review matches', copy: 'Roles are ranked with reasons and gaps.' },
  { step: '03', title: 'Apply faster', copy: 'Resume details carry into the form.' },
]


export default function LandingPage({ onBrowseAll, onCandidateLoginClick, onRecruiterLoginClick, onMatchResult }: Props) {
  return (
    <PageLayout
      className="landing-page-main"
      navbar={{
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
      }}
    >
      <section className="landing-shell" aria-label="ASTRA landing">
        <div className="landing-hero">
          <div className="landing-hero__left" style={{ paddingTop: 80 }}>
            <div className="landing-kicker">AI Screening, Talent &amp; Recruitment Assistant</div>
            <h1 className="landing-title">ASTRA</h1>
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
            <RinaSpeaking
              onMatchResult={onMatchResult}
              onBrowseRoles={onBrowseAll}
            />
          </div>
        </div>
      </section>

    </PageLayout>
  )
}
