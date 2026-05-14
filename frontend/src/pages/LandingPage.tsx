import PageLayout from '../components/PageLayout'

type Props = {
  onBrowseAll: () => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
}

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
        <div className="landing-kicker">AI Screening, Talent & Recruitment Assistant</div>
        <h1 className="landing-title">ASTRA</h1>
        <p className="landing-copy">
          Rina is ready in the lower-right corner. Start with a resume match for ranked job recommendations,
          or browse every open role from her panel.
        </p>
      </section>
    </PageLayout>
  )
}
