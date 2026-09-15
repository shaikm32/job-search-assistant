# AI Architecture

## Status

The original MVP architecture explicitly excluded AI features. M9 is now an approved product direction and therefore requires a dedicated technical architecture before implementation.

This file intentionally separates the **technical questions** from the M9 product specification.

## Product requirement

M9 requires an AI-powered workflow for:
- resume/JD analysis
- ATS Score estimation
- Fit Match classification
- identifying JD-specific gaps
- proposing resume improvements
- incorporating user-approved improvements
- generating a tailored cover letter

The authoritative product behavior is documented in:

`docs/product/features/RESUME_ENHANCER.md`

## Technical architecture to define before implementation

The implementation must establish:
- an AI provider abstraction
- structured analysis output
- structured enhancement suggestions
- controlled resume transformation
- document parsing/extraction for PDF and DOCX
- final document generation for DOCX and PDF
- timeout/error behavior for the ≤60 second target
- data handling and privacy boundaries
- validation against fabricated content
- persistence lifecycle for Recent Enhancements
- observability appropriate to a local application

## Important architectural constraint

Do not add AI infrastructure merely because the product may eventually use agents, RAG, or other techniques.

Choose the simplest technical architecture that reliably supports the approved M9 workflow.

## Privacy

AI processing must be designed with the product's local-first/privacy-first principles in mind. Any external AI provider dependency, data transmission, credential handling, retention, or local-model alternative must be explicitly decided before implementation.
