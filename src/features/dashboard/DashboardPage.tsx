import { Link } from 'react-router'
import { APPLICATION_STAGES } from '../../../shared/domain/application.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { useDashboard } from './useDashboard.js'
import './DashboardPage.css'

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

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Where does your job search currently stand?</p>

      <section aria-label="Application metrics">
        <h2>Applications</h2>
        <div className="metric-cards">
          <div className="metric-card">
            <span className="metric-value">{applications.total}</span>
            <span className="metric-label">Total Applications</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{applications.active}</span>
            <span className="metric-label">Active Applications</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{applications.interviews}</span>
            <span className="metric-label">Interviews</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{applications.offers}</span>
            <span className="metric-label">Offers</span>
          </div>
        </div>
      </section>

      <section aria-label="Application pipeline">
        <h2>Pipeline</h2>
        <ul className="pipeline-list">
          {APPLICATION_STAGES.map((stage) => (
            <li key={stage} className="pipeline-row">
              <Link
                className="link"
                to={`/applications?stage=${encodeURIComponent(stage)}`}
              >
                {stage}
              </Link>
              <span className="pipeline-count">{applications.byStage[stage]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Recent applications">
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
            <Link className="button button--primary" to="/applications/new">
              + Add Application
            </Link>
          </div>
        ) : (
          <ul className="recent-list">
            {recentApplications.map((recent) => (
              <li key={recent.id} className="recent-row">
                <Link className="link" to={`/applications/${recent.id}`}>
                  {recent.company} — {recent.jobTitle}
                </Link>
                <span className="recent-meta">
                  <span className="stage-badge">{recent.currentStage}</span> {recent.dateApplied}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Networking metrics">
        <div className="section-header">
          <h2>Networking</h2>
          <Link className="link" to="/people">
            View all people
          </Link>
        </div>
        <div className="metric-cards">
          <div className="metric-card">
            <span className="metric-value">{networking.total}</span>
            <span className="metric-label">Total People</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{networking.requestsSent}</span>
            <span className="metric-label">Requests Sent</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{networking.connected}</span>
            <span className="metric-label">Connected</span>
          </div>
          <div className="metric-card">
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
