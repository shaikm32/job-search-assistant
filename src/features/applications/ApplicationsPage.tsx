import { Link } from 'react-router'
import { APPLICATION_STAGES } from '../../../shared/domain/application.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import type { ApplicationDetail } from './applicationsApi.js'
import { useApplications } from './useApplications.js'
import './ApplicationsPage.css'

const SORT_FIELDS = [
  { key: 'company', label: 'Company' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'location', label: 'Location' },
  { key: 'currentStage', label: 'Current Stage' },
  { key: 'dateApplied', label: 'Date Applied' },
] as const

function documentAttached(detail: ApplicationDetail, type: string): boolean {
  return detail.documents.some((document) => document.documentType === type)
}

export function ApplicationsPage() {
  const {
    status,
    result,
    error,
    searchParams,
    updateParams,
    clearFilters,
    hasActiveFilters,
  } = useApplications()

  const search = searchParams.get('search') ?? ''
  const stage = searchParams.get('stage') ?? ''
  const location = searchParams.get('location') ?? ''
  const sortBy = searchParams.get('sortBy') ?? 'dateApplied'
  const sortOrder = searchParams.get('sortOrder') ?? 'desc'

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      updateParams({ sortBy: key, sortOrder: sortOrder === 'asc' ? 'desc' : undefined })
    } else {
      updateParams({ sortBy: key === 'dateApplied' ? undefined : key, sortOrder: undefined })
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">Track every job application and the documents submitted with it.</p>
        </div>
        <Link className="button button--primary" to="/applications/new">
          + Add Application
        </Link>
      </div>

      <div className="filters">
        <label className="filter-field">
          <span className="filter-label">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Company, job title, or location"
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || undefined })}
          />
        </label>
        <label className="filter-field">
          <span className="filter-label">Current stage</span>
          <select
            className="input"
            value={stage}
            onChange={(event) => updateParams({ stage: event.target.value || undefined })}
          >
            <option value="">All stages</option>
            {APPLICATION_STAGES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="filter-label">Location</span>
          <input
            className="input"
            type="text"
            placeholder="Filter by location"
            value={location}
            onChange={(event) => updateParams({ location: event.target.value || undefined })}
          />
        </label>
        {hasActiveFilters ? (
          <button className="button button--ghost" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {status === 'loading' ? <StatusBanner tone="loading">Loading applications…</StatusBanner> : null}
      {status === 'error' ? <StatusBanner tone="error">{error}</StatusBanner> : null}

      {status === 'ready' && result.total === 0 && !hasActiveFilters ? (
        <div className="empty-state">
          <h2>No applications yet</h2>
          <p>
            Start building your job search pipeline. Add your first application to track its
            progress, documents, and current stage in one place.
          </p>
          <Link className="button button--primary" to="/applications/new">
            + Add Application
          </Link>
        </div>
      ) : null}

      {status === 'ready' && result.total === 0 && hasActiveFilters ? (
        <div className="empty-state">
          <h2>No matches</h2>
          <p>No applications match your search or filters.</p>
          <button className="button button--ghost" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {status === 'ready' && result.total > 0 ? (
        <table className="table">
          <thead>
            <tr>
              {SORT_FIELDS.map((field) => (
                <th key={field.key} aria-sort={sortBy === field.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => toggleSort(field.key)}
                    aria-label={`Sort by ${field.label}`}
                  >
                    {field.label}
                    {sortBy === field.key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : null}
                  </button>
                </th>
              ))}
              <th>Resume</th>
              <th>Cover Letter</th>
            </tr>
          </thead>
          <tbody>
            {result.applications.map((detail) => (
              <tr key={detail.application.id}>
                <td>
                  <Link className="link" to={`/applications/${detail.application.id}`}>
                    {detail.application.company}
                  </Link>
                </td>
                <td>
                  <Link className="link" to={`/applications/${detail.application.id}`}>
                    {detail.application.jobTitle}
                  </Link>
                </td>
                <td>{detail.application.location}</td>
                <td>
                  <span className="stage-badge">{detail.application.currentStage}</span>
                </td>
                <td>{detail.application.dateApplied}</td>
                <td>{documentAttached(detail, 'Resume') ? 'Attached' : '—'}</td>
                <td>{documentAttached(detail, 'Cover Letter') ? 'Attached' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
