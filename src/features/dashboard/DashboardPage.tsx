import { Link } from 'react-router'
import type { ApplicationStage } from '../../../shared/domain/application.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { StatusBadge, stageTone } from '../../components/common/StatusBadge.js'
import { useDashboard } from './useDashboard.js'
import './DashboardPage.css'

/**
 * Dashboard Pipeline presentation order and labels. This is a
 * presentation-surface decision only: the shared ApplicationStage domain
 * (including 'Recruiter Screening' and the internal 'Offer' value) is
 * untouched, and records in non-displayed stages keep working everywhere
 * else. `stage` is the domain value (counts, filters, data-stage);
 * `label` is what the Dashboard shows.
 */
const DASHBOARD_PIPELINE_STAGES: ReadonlyArray<{ stage: ApplicationStage; label: string }> = [
  { stage: 'Applied', label: 'Applied' },
  { stage: 'Interview 1', label: 'Interview 1' },
  { stage: 'Interview 2', label: 'Interview 2' },
  { stage: 'Final Interview', label: 'Final Interview' },
  { stage: 'Offer', label: 'Offer Received' },
  { stage: 'Withdrawn', label: 'Withdrawn' },
  { stage: 'Rejected', label: 'Rejected' },
]

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 6V4.8A1.8 1.8 0 0 1 8.8 3h2.4A1.8 1.8 0 0 1 13 4.8V6M2.5 10h15" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10.8 2 4 11h4.2L8.8 18l6.8-9h-4.2l-.6-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5v-3.5H5.5A2.5 2.5 0 0 1 3 10.5v-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 3h8v4.5a4 4 0 0 1-8 0V3ZM6 5H3.5A1.5 1.5 0 0 0 2 6.5C2 8.4 3.6 10 5.5 10M14 5h2.5A1.5 1.5 0 0 1 18 6.5C18 8.4 16.4 10 14.5 10M10 11.5V14M7 17h6M8.5 14h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="7" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1.8 16.5c.7-2.8 2.7-4.3 5.2-4.3s4.5 1.5 5.2 4.3M13.5 3.9a2.8 2.8 0 0 1 0 5.3M15.4 12.5c1.6.6 2.6 1.9 3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return 'Good morning'
  }
  if (hour < 18) {
    return 'Good afternoon'
  }
  return 'Good evening'
}

export function DashboardPage() {
  const { status, summary, error, reload } = useDashboard()

  if (status === 'loading') {
    return (
      <div className="page">
        <h1 className="page-title">Dashboard</h1>
        <StatusBanner tone="loading">Loading dashboard…</StatusBanner>
      </div>
    )
  }

  if (status === 'error' || !summary) {
    return (
      <div className="page">
        <h1 className="page-title">Dashboard</h1>
        <StatusBanner tone="error">{error ?? 'Something went wrong. Please try again.'}</StatusBanner>
        <button className="button button--ghost" type="button" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    )
  }

  const { applications, recentApplications, networking } = summary
  const maxPipeline = Math.max(1, ...DASHBOARD_PIPELINE_STAGES.map(({ stage }) => applications.byStage[stage]))

  return (
    <div className="page dashboard">
      <div className="dashboard-hero">
        <h1 className="page-title">{greetingForHour(new Date().getHours())}</h1>
        <p className="page-subtitle">
          {applications.total === 0
            ? 'Where does your job search currently stand? Start by adding your first application.'
            : `Where does your job search currently stand? ${applications.active} active application${applications.active === 1 ? '' : 's'}, ${applications.interviews} in interviews.`}
        </p>
      </div>

      <section aria-label="Application metrics">
        <div className="metric-cards">
          <div className="metric-card metric-card--blue">
            <div className="metric-card-head">
              <span className="metric-value">{applications.total}</span>
              <span className="icon-chip icon-chip--blue"><BriefcaseIcon /></span>
            </div>
            <span className="metric-label">Total Applications</span>
          </div>
          <div className="metric-card metric-card--purple">
            <div className="metric-card-head">
              <span className="metric-value">{applications.active}</span>
              <span className="icon-chip icon-chip--purple"><BoltIcon /></span>
            </div>
            <span className="metric-label">Active Applications</span>
          </div>
          <div className="metric-card metric-card--amber">
            <div className="metric-card-head">
              <span className="metric-value">{applications.interviews}</span>
              <span className="icon-chip icon-chip--amber"><ChatIcon /></span>
            </div>
            <span className="metric-label">Interviews</span>
          </div>
          <div className="metric-card metric-card--green">
            <div className="metric-card-head">
              <span className="metric-value">{applications.offers}</span>
              <span className="icon-chip icon-chip--green"><TrophyIcon /></span>
            </div>
            <span className="metric-label">Offers</span>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section aria-label="Application pipeline" className="dashboard-panel">
          <div className="section-header">
            <h2>Pipeline</h2>
            <Link className="link" to="/applications">
              View all
            </Link>
          </div>
          <ul className="pipeline-list">
            {DASHBOARD_PIPELINE_STAGES.map(({ stage, label }) => (
              <li key={stage} className="pipeline-row" data-stage={stage}>
                <Link
                  className="link"
                  to={`/applications?stage=${encodeURIComponent(stage)}`}
                >
                  {label}
                </Link>
                <span className="pipeline-bar" aria-hidden="true">
                  <span
                    className="pipeline-fill"
                    style={{ width: `${(applications.byStage[stage] / maxPipeline) * 100}%` }}
                  />
                </span>
                <span className="pipeline-count">{applications.byStage[stage]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Recent applications" className="dashboard-panel">
          <div className="section-header">
            <h2>Recent Applications</h2>
            <Link className="link" to="/applications">
              View all applications
            </Link>
          </div>
          {recentApplications.length === 0 ? (
            <div className="empty-state">
              <h2>No applications yet</h2>
              <p>
                Start building your job search pipeline. Add your first application to track
                its progress, documents, and current stage in one place.
              </p>
              <Link className="button button--glass" to="/applications/new">
                + Add Application
              </Link>
            </div>
          ) : (
            <ul className="recent-list">
              {recentApplications.map((recent) => (
                <li key={recent.id} className="recent-row">
                  <Link className="link recent-title" to={`/applications/${recent.id}`}>
                    {recent.company} — {recent.jobTitle}
                  </Link>
                  <span className="recent-status">
                    <StatusBadge tone={stageTone(recent.currentStage)}>
                      {recent.currentStage}
                    </StatusBadge>
                  </span>
                  <span className="recent-date">{recent.dateApplied}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Networking metrics" className="dashboard-panel">
        <div className="section-header">
          <h2>Networking</h2>
            <Link className="link" to="/people">
              View all networking
            </Link>
        </div>
        <div className="metric-cards metric-cards--compact">
          <div className="metric-card metric-card--blue">
            <div className="metric-card-head">
              <span className="metric-value">{networking.total}</span>
              <span className="icon-chip icon-chip--accent"><UsersIcon /></span>
            </div>
            <span className="metric-label">Total People</span>
          </div>
          <div className="metric-card metric-card--amber">
            <div className="metric-card-head">
              <span className="metric-value">{networking.requestsSent}</span>
              <span className="icon-chip icon-chip--amber"><ChatIcon /></span>
            </div>
            <span className="metric-label">Requests Sent</span>
          </div>
          <div className="metric-card metric-card--green">
            <div className="metric-card-head">
              <span className="metric-value">{networking.connected}</span>
              <span className="icon-chip icon-chip--green"><UsersIcon /></span>
            </div>
            <span className="metric-label">Connected</span>
          </div>
          <div className="metric-card metric-card--purple">
            <span className="metric-value">
              {networking.acceptanceRate === null
                ? 'No connection outcomes yet'
                : `${networking.acceptanceRate}%`}
            </span>
            <span className="metric-label">Connection Acceptance Rate</span>
          </div>
        </div>
      </section>
    </div>
  )
}
