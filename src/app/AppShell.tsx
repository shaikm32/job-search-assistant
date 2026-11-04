import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, type NavLinkRenderProps } from 'react-router'
import './AppShell.css'
import { useNavigationLockStatus } from './navigationLock.js'
import { useTheme } from './theme.js'

const TITLES: Array<[RegExp, string]> = [
  [/^\/applications\/new$/, 'Add Application - Job Search Assistant'],
  [/^\/applications\/[^/]+\/edit$/, 'Edit Application - Job Search Assistant'],
  [/^\/applications\/[^/]+$/, 'Application Details - Job Search Assistant'],
  [/^\/applications$/, 'Applications - Job Search Assistant'],
  [/^\/people\/new$/, 'Add Person - Job Search Assistant'],
  [/^\/people\/[^/]+\/edit$/, 'Edit Person - Job Search Assistant'],
  [/^\/people\/[^/]+$/, 'Person Details - Job Search Assistant'],
  [/^\/people$/, 'Networking - Job Search Assistant'],
  [/^\/resume-enhancer/, 'Resume Enhancer - Job Search Assistant'],
  [/^\/settings$/, 'Settings - Job Search Assistant'],
  [/^\/$/, 'Dashboard - Job Search Assistant'],
]

function titleFor(pathname: string): string {
  for (const [pattern, title] of TITLES) {
    if (pattern.test(pathname)) {
      return title
    }
  }
  return 'Job Search Assistant'
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' }) {
  if (theme === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M14.5 10.5A6 6 0 0 1 7.5 3.5a6 6 0 1 0 7 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AppShell() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const { theme, toggleTheme } = useTheme()
  // While the Resume Enhancer analysis is running the page holds a navigation
  // lock: header links are disabled here (and the page blocks router/history
  // navigation) so no route change can even be attempted.
  const navigationLocked = useNavigationLockStatus()

  useEffect(() => {
    document.title = titleFor(location.pathname)
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  const navClassName = ({ isActive }: NavLinkRenderProps) =>
    [
      'nav-link',
      isActive ? 'nav-link--active' : '',
      navigationLocked ? 'nav-link--disabled' : '',
    ]
      .filter((name) => name.length > 0)
      .join(' ')

  const lockProps = navigationLocked
    ? {
        'aria-disabled': true,
        tabIndex: -1,
        onClick: (event: { preventDefault: () => void }) => event.preventDefault(),
      }
    : {}

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <NavLink
            to="/"
            className={`brand${navigationLocked ? ' nav-link--disabled' : ''}`}
            aria-label="Job Search Assistant home"
            {...lockProps}
          >
            <span className="brand-mark" aria-hidden="true">
              J
            </span>
            <span className="brand-text">Job Search Assistant</span>
          </NavLink>
          <nav className="shell-nav" aria-label="Primary">
            <NavLink to="/" end className={navClassName} {...lockProps}>
              Dashboard
            </NavLink>
            <NavLink to="/applications" className={navClassName} {...lockProps}>
              Applications
            </NavLink>
            <NavLink to="/resume-enhancer" className={navClassName} {...lockProps}>
              Resume Enhancer
            </NavLink>
            <NavLink to="/people" className={navClassName} {...lockProps}>
              Networking
            </NavLink>
            <NavLink to="/settings" className={navClassName} {...lockProps}>
              Settings
            </NavLink>
          </nav>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>
      <main
        key={location.pathname}
        ref={mainRef}
        tabIndex={-1}
        className="shell-main"
      >
        <Outlet />
      </main>
    </div>
  )
}
