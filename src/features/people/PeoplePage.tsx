import { Link } from 'react-router'
import { CONNECTION_STATUSES } from '../../../shared/domain/person.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { usePeople } from './usePeople.js'
import './PeoplePage.css'

function SortHeader({
  sortKey,
  label,
  sortBy,
  sortOrder,
  onToggle,
}: {
  sortKey: string
  label: string
  sortBy: string
  sortOrder: string
  onToggle: (key: string) => void
}) {
  return (
    <th aria-sort={sortBy === sortKey ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="sort-button"
        onClick={() => onToggle(sortKey)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sortBy === sortKey ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : null}
      </button>
    </th>
  )
}

function isExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function PeoplePage() {
  const {
    status,
    result,
    error,
    searchParams,
    updateParams,
    clearFilters,
    hasActiveFilters,
  } = usePeople()

  const search = searchParams.get('search') ?? ''
  const connectionStatus = searchParams.get('connectionStatus') ?? ''
  const sortBy = searchParams.get('sortBy') ?? 'requestSent'
  const sortOrder = searchParams.get('sortOrder') ?? 'desc'

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      updateParams({ sortBy: key, sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sortBy: key === 'requestSent' ? undefined : key, sortOrder: undefined })
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-subtitle">Track your professional networking connections and outreach.</p>
        </div>
        <Link className="button button--primary" to="/people/new">
          + Add Person
        </Link>
      </div>

      <div className="filters">
        <label className="filter-field">
          <span className="filter-label">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Name, company, or job title"
            value={search}
            onChange={(event) => updateParams({ search: event.target.value || undefined })}
          />
        </label>
        <label className="filter-field">
          <span className="filter-label">Connection status</span>
          <select
            className="input"
            value={connectionStatus}
            onChange={(event) => updateParams({ connectionStatus: event.target.value || undefined })}
          >
            <option value="">All statuses</option>
            {CONNECTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters ? (
          <button className="button button--ghost" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {status === 'loading' ? <StatusBanner tone="loading">Loading people…</StatusBanner> : null}
      {status === 'error' ? <StatusBanner tone="error">{error}</StatusBanner> : null}

      {status === 'ready' && result.total === 0 && !hasActiveFilters ? (
        <div className="empty-state">
          <h2>No people yet</h2>
          <p>
            Start building your professional network. Add your first person to track your
            connections, outreach, and connection requests in one place.
          </p>
          <Link className="button button--primary" to="/people/new">
            + Add Person
          </Link>
        </div>
      ) : null}

      {status === 'ready' && result.total === 0 && hasActiveFilters ? (
        <div className="empty-state">
          <h2>No matches</h2>
          <p>No people match your search or filters.</p>
          <button className="button button--ghost" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {status === 'ready' && result.total > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <SortHeader sortKey="name" label="Name" sortBy={sortBy} sortOrder={sortOrder} onToggle={toggleSort} />
              <SortHeader sortKey="company" label="Company" sortBy={sortBy} sortOrder={sortOrder} onToggle={toggleSort} />
              <SortHeader sortKey="jobTitle" label="Job Title" sortBy={sortBy} sortOrder={sortOrder} onToggle={toggleSort} />
              <th>Person Type</th>
              <SortHeader sortKey="connectionStatus" label="Connection Status" sortBy={sortBy} sortOrder={sortOrder} onToggle={toggleSort} />
              <SortHeader sortKey="requestSent" label="Request Sent" sortBy={sortBy} sortOrder={sortOrder} onToggle={toggleSort} />
              <th>LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            {result.people.map((person) => (
              <tr key={person.id}>
                <td>
                  <Link className="link" to={`/people/${person.id}`}>
                    {person.name}
                  </Link>
                </td>
                <td>{person.company ?? '—'}</td>
                <td>{person.jobTitle ?? '—'}</td>
                <td>{person.personType ?? '—'}</td>
                <td>{person.connectionStatus}</td>
                <td>{person.requestSentDate ?? '—'}</td>
                <td>
                  {person.linkedinUrl && isExternalHttpUrl(person.linkedinUrl) ? (
                    <a className="link" href={person.linkedinUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
