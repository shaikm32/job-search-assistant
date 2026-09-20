import type { CoverLetter } from '../../../shared/domain/ai-enhancement.js'

/**
 * Read-only cover letter view (M9-F, RESUME_ENHANCER.md §12, PD-M9-016).
 * The letter is generated from the final enhanced resume and JD and is
 * presented read-only in M9.
 */
interface CoverLetterViewProps {
  coverLetter: CoverLetter
}

export function CoverLetterView({ coverLetter }: CoverLetterViewProps) {
  return (
    <section aria-label="Cover letter">
      <h2>Cover Letter</h2>
      <article className="cover-letter" aria-label="Generated cover letter">
        {coverLetter.content.split('\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </article>
    </section>
  )
}
