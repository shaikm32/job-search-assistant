import type { CoverLetter } from '../../../shared/domain/ai-enhancement.js'

/**
 * Read-only cover letter view (M9-F, RESUME_ENHANCER.md §12, PD-M9-016).
 *
 * The letter is rendered from its blank-line-separated paragraphs, preserving
 * internal line breaks, with a word count. It never shows provider metadata.
 */
interface CoverLetterViewProps {
  coverLetter: CoverLetter
}

function paragraphBlocks(content: string): string[] {
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

function wordCount(content: string): number {
  return content.trim().split(/\s+/).filter((word) => word.length > 0).length
}

export function CoverLetterView({ coverLetter }: CoverLetterViewProps) {
  const paragraphs = paragraphBlocks(coverLetter.content)
  return (
    <section aria-label="Cover letter">
      <div className="cover-letter__header">
        <h2>Cover Letter</h2>
        <p className="muted">{wordCount(coverLetter.content)} words</p>
      </div>
      <article className="cover-letter" aria-label="Generated cover letter">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="cover-letter__paragraph">
            {paragraph}
          </p>
        ))}
      </article>
    </section>
  )
}
