import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  onHome?: () => void
  rightContent?: ReactNode
  showLoginButtons?: boolean
  onCandidateLogin?: () => void
  onRecruiterLogin?: () => void
  onInternalLogin?: () => void
}

export default function Navbar({ onHome, rightContent, showLoginButtons, onCandidateLogin, onRecruiterLogin, onInternalLogin }: Props) {
  const [loginOpen, setLoginOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setLoginOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function selectLogin(cb?: () => void) {
    setLoginOpen(false)
    cb?.()
  }

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
            <div className="login-menu" ref={menuRef}>
              <button
                className="btn btn-primary login-menu__trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={loginOpen}
                onClick={() => setLoginOpen(open => !open)}
              >
                Login
                <span className="login-menu__chevron" aria-hidden="true">▾</span>
              </button>
              {loginOpen && (
                <div className="login-menu__panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => selectLogin(onRecruiterLogin)}>
                    <strong>Recruiter Login</strong>
                    <small>Hiring dashboard</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => selectLogin(onCandidateLogin)}>
                    <strong>Candidate Login</strong>
                    <small>Application status</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => selectLogin(onInternalLogin)}>
                    <strong>Internal Employee Login</strong>
                    <small>Apply or refer</small>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
