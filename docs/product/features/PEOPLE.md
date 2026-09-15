# People

## Purpose

People is intentionally limited to professional networking connection tracking in the MVP. It is not a CRM.

## People List

Header:
**People**

Supporting text:
> Track your professional networking connections and outreach.

Primary action:
**+ Add Person**

### Search

Search by:
- Name
- Company
- Job Title

### Filter

MVP:
- Connection Status

### Table

Columns:
- Name
- Company
- Job Title
- Person Type
- Connection Status
- Request Sent
- LinkedIn

Rows navigate to:
`/people/:id`

LinkedIn links should open externally.

### Sorting

Sortable:
- Name
- Company
- Job Title
- Connection Status
- Request Sent

Default:
**Request Sent descending**

People without a request date appear after people with dates.

## Add Person

Use a dedicated page.

Navigation:
`← People`

Required:
- Name
- Connection Status

Optional:
- Company
- Job Title
- Person Type
- LinkedIn URL
- Connection Request Date
- Notes

## Person Detail

Display:
- Name
- Company
- Job Title
- Person Type
- Connection Status
- LinkedIn URL
- Request Sent Date
- Notes

Primary action:
**Edit Person**

## Edit Person

Use the Add Person form structure and pre-populate existing values.

Actions:
- Cancel
- Save Changes

## Delete Person

Deletion requires confirmation.
