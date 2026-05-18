import PageLayout from '../components/PageLayout'

type Props = {
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
  onInternalLoginClick: () => void
}

const FLOW_POINTERS = [
  { title: 'Upload resume', copy: 'Rina reads your PDF or TXT profile.' },
  { title: 'Review matches', copy: 'Roles are ranked with reasons and gaps.' },
  { title: 'Apply faster', copy: 'Resume details carry into the form.' },
]

export default function LandingPage({ onCandidateLoginClick, onRecruiterLoginClick, onInternalLoginClick }: Props) {
  return (
    <PageLayout
      className="landing-page-main"
      navbar={{
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
        onInternalLogin: onInternalLoginClick,
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
            <ul className="landing-flow-pointers" aria-label="Resume matching steps">
              {FLOW_POINTERS.map(({ title, copy }) => (
                <li className="landing-flow-pointer" key={title}>
                  <span className="landing-flow-bullet" aria-hidden="true" />
                  <span>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>
    </PageLayout>
  )
}
