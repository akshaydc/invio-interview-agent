import type { ReactNode, CSSProperties } from 'react'
import Navbar from './Navbar'

type NavbarOptions = {
  onHome?: () => void
  rightContent?: ReactNode
  showLoginButtons?: boolean
  onCandidateLogin?: () => void
  onRecruiterLogin?: () => void
}

type Props = {
  children: ReactNode
  navbar?: NavbarOptions
  contentStyle?: CSSProperties
}

export default function PageLayout({ children, navbar, contentStyle }: Props) {
  return (
    <>
      {navbar && <Navbar {...navbar} />}
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          ...contentStyle,
        }}
      >
        {children}
      </main>
    </>
  )
}
