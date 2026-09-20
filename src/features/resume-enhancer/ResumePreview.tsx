import type { Resume } from '../../../shared/domain/ai-enhancement.js'

/**
 * Renders the canonical structured resume into a clean, ATS-friendly HTML
 * template (M9-F, RESUME_ENHANCER.md §11, PD-M9-027). Source formatting is not
 * preserved: the template is generated from the canonical structure.
 */
interface ResumePreviewProps {
  resume: Resume
  heading?: string
}

export function ResumePreview({ resume, heading = 'Final Resume' }: ResumePreviewProps) {
  const { contact } = resume
  const contactLine = [contact.email, contact.phone, contact.location].filter(
    (value): value is string => Boolean(value),
  )

  return (
    <section className="resume-preview" aria-label={heading}>
      <h2>{heading}</h2>
      <article className="resume-preview__document">
        {contact.name ? <h3 className="resume-preview__name">{contact.name}</h3> : null}
        {contactLine.length > 0 ? (
          <p className="resume-preview__contact">{contactLine.join(' | ')}</p>
        ) : null}
        {contact.links.length > 0 ? (
          <p className="resume-preview__contact">{contact.links.join(' | ')}</p>
        ) : null}
        {resume.sections.map((section, index) => (
          <section key={`${section.section}-${index}`} className="resume-preview__section">
            <h4>{section.heading}</h4>
            {section.content.split('\n').map((paragraph, lineIndex) => (
              <p key={lineIndex}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </section>
  )
}
