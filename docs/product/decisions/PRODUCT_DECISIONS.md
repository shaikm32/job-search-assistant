# Product Decisions

This document records product-level decisions that apply across features.

## Product vs Architecture

Product decisions describe what the product should do and why.

Technical implementation decisions belong in the Architecture documentation.

## MVP decisions

- Product is local-first.
- Primary user data remains local by default.
- MVP is focused on Applications, People, and Dashboard.
- People is connection tracking, not a CRM.
- Dashboard is useful operationally, not an analytics-heavy reporting tool.
- Applications use dedicated pages for add/edit rather than modals.
- Application documents are Resume and Cover Letter in the MVP.
- Original user files must never be modified, moved, or deleted by application document management.
- Dashboard metrics are computed from source data rather than stored separately.
- Navigation is route-based.
- No persistent left sidebar.
- Dark theme is the primary visual experience; light theme is supported.
- Avoid pure black surfaces.
- Use clear hierarchy, comfortable spacing, subtle borders, restrained shadows, accessible contrast, clear hover states, and minimal animation.
- Avoid excessive gradients, decoration, heavy animation, and unnecessary UI complexity.

## M9 decisions

See `features/RESUME_ENHANCER.md` for the complete feature specification.

Locked decisions include:
- no Master Resume
- PDF/DOCX resume input
- pasted JD
- ATS Score + Fit Match
- JD-specific "What's Good" and "What's Missing"
- user-selected AI suggestions
- no fabrication
- final resume preview before download
- DOCX/PDF output
- read-only cover letter
- cover letter generated from final enhanced resume + JD
- 3-day retention
- maximum 3 recent incomplete enhancements
- no permanent enhancement history
- only final resume and cover letter carried into a newly created Application
