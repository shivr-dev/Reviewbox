# Word export verification

Checked 2026-11-01 against the actual `lib/export-docx.ts` exporter. Isolated fixtures contain math, Chinese text, choices, matching IDs, Rubric, SOLO and a real optical diagram from the application's `OpticsDrawing` component. The fixtures were never installed in a user learning space.

## Results

- Six automated tests pass: student/exam answer isolation, answer/detail/teacher separation, readable matching pair labels, native fractions/roots/subscripts/superscripts, SVG/PNG fallback and aspect ratio, and explicit rejection of unsupported matrix formulas.
- Both student editions exclude answer, explanation, Rubric and solution-stage image content.
- Teacher output includes fixed criterion maxima, full/partial credit, deductions, and the five SOLO descriptors.
- SVG export embeds the original optical rendering, with PNG fallback. An image of 600 by 300 scales to 540 by 270 without distortion.
- Five real DOCX samples are in `outputs/word-v2/`: `workbook.docx`, `exam.docx`, `answers.docx`, `solutions.docx`, `teacher.docx`. Package inspection is recorded in `package-inspection.json`.
- Native equations are present as OMML, not raw LaTeX text. Matching answers resolve stable IDs to the corresponding visible texts.

## Verification limit

The packaged `render_docx.py` was invoked on the generated teacher DOCX, but this Windows environment has no `soffice.exe`. It failed with `FileNotFoundError: LibreOffice soffice.exe was not found on PATH`. No page PNGs were produced. The samples therefore have **not passed visual pagination, Chinese font, Microsoft Word or WPS acceptance**; package/XML tests cannot establish those qualities. Do not describe these files as visually verified or publication-ready based on this check.

Matrices currently fail explicitly rather than being flattened into incorrect equations. They do not yet have an automatic vector-image fallback.
