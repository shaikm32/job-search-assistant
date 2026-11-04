# Dashboard

## Purpose

The Dashboard answers:

> Where does my job search currently stand?

It should provide useful information without becoming an analytics-heavy reporting tool.

## Application Metrics

Display:
- Total Applications
- Active Applications
- Interviews
- Offers

### Active Applications

All applications excluding:
- Rejected
- Withdrawn

### Interviews

Applications currently in:
- Interview 1
- Interview 2
- Final Interview

### Offers

Applications currently in:
- Offer

## Application Pipeline

Display application counts grouped by current stage.

A simple pipeline summary is preferred over an unnecessarily complex chart.

## Recent Applications

Display up to **5**.

Show:
- Company
- Job Title
- Current Stage
- Date Applied

Provide navigation to Applications.

## Networking Metrics

Display:
- Total People
- Requests Sent
- Connected
- Connection Acceptance Rate

## Connection Acceptance Rate

Calculate:

```text
Connected
────────────────────────────────────────────────────── × 100
Request Sent + Connected + Not Connected
```

Only outgoing connection requests count. Each person represents at most one
outgoing request, so pending, accepted, and declined requests are counted once.
Pending requests remain in the denominator.

Exclude:
- Identified

If no requests have been sent, show:

```text
—
```

## Product constraints

Dashboard metrics are derived from source data and are not a separate user-maintained dataset.
