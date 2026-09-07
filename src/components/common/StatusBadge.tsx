import type { ReactNode } from 'react'
import type { ApplicationStage } from '../../../shared/domain/application.js'
import type { ConnectionStatus } from '../../../shared/domain/person.js'

export type BadgeTone =
  | 'accent'
  | 'info'
  | 'cyan'
  | 'purple'
  | 'pink'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'

export function stageTone(stage: ApplicationStage): BadgeTone {
  switch (stage) {
    case 'Applied':
      return 'info'
    case 'Recruiter Screening':
      return 'cyan'
    case 'Interview 1':
    case 'Interview 2':
      return 'purple'
    case 'Final Interview':
      return 'pink'
    case 'Offer':
      return 'success'
    case 'Rejected':
      return 'danger'
    case 'Withdrawn':
      return 'neutral'
  }
}

export function connectionTone(status: ConnectionStatus): BadgeTone {
  switch (status) {
    case 'Connected':
      return 'success'
    case 'Not Connected':
      return 'danger'
    case 'Request Sent':
      return 'warning'
    case 'Identified':
      return 'info'
  }
}

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
