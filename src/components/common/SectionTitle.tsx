import type { ReactNode } from 'react'

export function BriefcaseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="4.8" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.6 4.8V3.9a1.4 1.4 0 0 1 1.4-1.4h2A1.4 1.4 0 0 1 10.4 3.9v.9M2 8h12" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function DocGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 1.8h5.5L12.5 5v9.2H4V1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.3 2v3.2h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export function NoteGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 13.5v-11h10v11l-2.5-1.8-2.5 1.8-2.5-1.8L3 13.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export function UserGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 14c.6-2.6 2.7-4 5.5-4s4.9 1.4 5.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function LinkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7 9.5a3.5 3.5 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5l-1.2 1.2M9 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1.2-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const ICONS = {
  briefcase: BriefcaseGlyph,
  doc: DocGlyph,
  note: NoteGlyph,
  user: UserGlyph,
  link: LinkGlyph,
} as const

export type SectionIcon = keyof typeof ICONS

export function SectionTitle({ icon, children }: { icon: SectionIcon; children: ReactNode }) {
  const Glyph = ICONS[icon]
  return (
    <span className="section-title">
      <span className="icon-chip icon-chip--accent">
        <Glyph />
      </span>
      {children}
    </span>
  )
}
