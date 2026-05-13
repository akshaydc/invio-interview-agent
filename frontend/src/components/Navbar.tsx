import type { ReactNode } from 'react'

type Props = {
  onHome?: () => void
  rightContent?: ReactNode
  showLoginButtons?: boolean
  onCandidateLogin?: () => void
  onRecruiterLogin?: () => void
}

export default function Navbar({ onHome, rightContent, showLoginButtons, onCandidateLogin, onRecruiterLogin }: Props) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div
          className="navbar-brand"
          onClick={onHome}
          style={{ cursor: onHome ? 'pointer' : 'default' }}
        >
          <span className="navbar-logo">ASTRA</span>
          <span className="navbar-tagline">AI Screening, Talent &amp; Recruitment Assistant</span>
        </div>
        <div className="navbar-right">
          {rightContent}
          {showLoginButtons && (
            <>
              <button className="btn btn-outline" onClick={onCandidateLogin}>Candidate Login</button>
              <button className="btn btn-primary" onClick={onRecruiterLogin}>Recruiter Login</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
