import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import './AppShell.css'

const TITLES: Array<[RegExp, string]> = [
  [/^\/applications\/new$/, 'Add Application - Job Search Assistant'],
  [/^\/applications\/[^/]+\/edit$/, 'Edit Application - Job Search Assistant'],
  [/^\/applications\/[^/]+$/, 'Application Details - Job Search Assistant'],
  [/^\/applications$/, 'Applications - Job Search Assistant'],
  [/^\/people/, 'People - Job Search Assistant'],
  [/^\/$/, 'Job Search Assistant'],
]

function titleFor(pathname: string): string {
  for (const [pattern, title] of TITLES) {
    if (pattern.test(pathname)) {
      return title
    }
  }
  return 'Job Search Assistant'
}

export function AppShell() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = titleFor(location.pathname)
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <NavLink to="/applications" className="brand">
            Job Search Assistant
          </NavLink>
          <nav className="shell-nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/applications"
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            >
              Applications
            </NavLink>
            <NavLink
              to="/people"
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            >
              People
            </NavLink>
          </nav>
        </div>
      </header>
      <main ref={mainRef} tabIndex={-1} className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
