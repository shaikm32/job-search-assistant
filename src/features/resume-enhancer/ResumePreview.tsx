import type { Resume } from '../../../shared/domain/ai-enhancement.js'

/**
 * Renders the canonical structured resume into a clean, ATS-friendly HTML
 * template (M9-F, RESUME_ENHANCER.md §11, PD-M9-027).
 *
 * Source formatting is not preserved, but the readable structure the canonical
 * content already carries is: blank-line-separated blocks, bullet/list markers,
 * and date-bearing entry lines. Nothing is added that the content does not
 * contain.
 */
interface ResumePreviewProps {
  resume: Resume
  heading?: string
}

interface ResumeListBlock {
  kind: 'list'
  ordered: boolean
  items: string[]
}

interface ResumeTextBlock {
  kind: 'paragraph' | 'entry'
  text: string
}

type ResumeBlock = ResumeListBlock | ResumeTextBlock

const UNORDERED_MARKER = /^\s*[-*•]\s+(.*)$/
const ORDERED_MARKER = /^\s*\d+[.)]\s+(.*)$/
const MONTH_YEAR_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b/i
const YEAR_RANGE_PATTERN = /\b(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present)\b/i
const PRESENT_PATTERN = /\bpresent\b/i

function isEntryLine(line: string): boolean {
  return (
    MONTH_YEAR_PATTERN.test(line) ||
    YEAR_RANGE_PATTERN.test(line) ||
    PRESENT_PATTERN.test(line)
  )
}

function parseContent(content: string): ResumeBlock[] {
  const blocks: ResumeBlock[] = []
  const textBlocks = content.replace(/\r\n?/g, '\n').split(/\n\s*\n/)

  for (const block of textBlocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    let currentList: ResumeListBlock | null = null

    const flushList = () => {
      if (currentList) {
        blocks.push(currentList)
        currentList = null
      }
    }

    for (const line of lines) {
      const unordered = line.match(UNORDERED_MARKER)
      const ordered = line.match(ORDERED_MARKER)
      if (unordered) {
        if (!currentList || currentList.ordered) {
          flushList()
          currentList = { kind: 'list', ordered: false, items: [] }
        }
        currentList.items.push(unordered[1] ?? '')
        continue
      }
      if (ordered) {
        if (!currentList || !currentList.ordered) {
          flushList()
          currentList = { kind: 'list', ordered: true, items: [] }
        }
        currentList.items.push(ordered[1] ?? '')
        continue
      }
      flushList()
      blocks.push({
        kind: isEntryLine(line) ? 'entry' : 'paragraph',
        text: line,
      })
    }
    flushList()
  }

  return blocks
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
            {parseContent(section.content).map((block, blockIndex) => {
              if (block.kind === 'list') {
                return block.ordered ? (
                  <ol key={blockIndex} className="resume-preview__list">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <ul key={blockIndex} className="resume-preview__list">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                )
              }
              return (
                <p
                  key={blockIndex}
                  className={
                    block.kind === 'entry' ? 'resume-preview__entry' : undefined
                  }
                >
                  {block.text}
                </p>
              )
            })}
          </section>
        ))}
      </article>
    </section>
  )
}
