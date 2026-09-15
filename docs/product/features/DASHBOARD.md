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
──────────────────────────── × 100
Connected + Not Connected
```

Exclude:
- Identified
- Request Sent

If no resolved outcomes exist, show:

```text
No connection outcomes yet
```

## Product constraints

Dashboard metrics are derived from source data and are not a separate user-maintained dataset.
