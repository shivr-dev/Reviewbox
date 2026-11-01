# Reviewbox 2.0 integration checkpoint — 2026-11-01

The existing five-icon product UI is the production entry. There is no separate simulated replacement UI or Alpha opt-in. The penguin remains the profile entry. Habitat navigation and placement UI are retired; historical wallet transactions remain readable.

## Delivered in this checkpoint

- Matching drafts persist through the same answer-change path as text answers. Reordering right-hand items never changes their IDs. Saved answers and immutable events retain the ID mapping, with a matching snapshot for history.
- Cytoscape knowledge maps use authored prerequisites, weighted dependencies, related nodes and chapter membership. They never invent prerequisite edges. Empty data is shown explicitly. Canvas height and toolbar sizing no longer conflict with the MAP exam stylesheet.
- New learning spaces start empty. Original unchanged `review-core` and `review-framework` content is retired through the guarded removal flow. Personal edits, notes, answer events, real exam results and historical question snapshots are retained.
- Pack removal previews exclusive/shared content, uses an atomic local transaction, has an undo window and synchronization tombstones. Explicit reinstall acknowledges the removal operation. Pack updates preserve verification for unchanged content and require choices for conflicts.
- i18next/react-i18next provide eight lazy-loaded UI languages. Imported learning content is not translated. Locale assets have matching keys and interpolation parameters; locale choice uses saved preference before browser language.
- Existing questions can be exported to five DOCX editions, including editable supported native equations, matching tables, actual question diagrams, PNG fallback, scoring criteria and SOLO. Filters include pack/wrong answers, chapter, question type and difficulty. Student editions do not contain solution-stage content.
- Private reference adapters support K12 Parquet/JSONL and TAR indexes, EduQS JSONL and CJEval JSONL. Indexed owner-scoped retrieval precedes bounded model selection. References do not bypass independent solve/judge verification. Operator ingestion stays outside the browser bundle.
- External authoring Skill 2.1 documents stable matching IDs, self-contained knowledge nodes, truthful map relationships and separation between interface language and study content.

## Verification and limits

`scripts/test-production.mjs` covers 26 assertions/tests across matching, pack update/removal, legacy cleanup, authored map links, source adapters, all eight locale asset sets, and DOCX output. The existing gameplay/learning regression runner also remains in use. GitHub Pages is built and its CSS/JavaScript artifact checked with `scripts/verify-pages.mjs`.

DOCX package inspection is not visual pagination acceptance. This machine lacks LibreOffice, so no Word/WPS page-render claim is made. Unsupported matrix/accent formula layouts currently fail explicitly instead of producing incorrect output.

The private reference table/schema and ingestion/retrieval path are implemented; this checkpoint does not claim that the complete multi-gigabyte datasets or image archive have been imported or mathematically reviewed. Image-dependent and grade-conflicting source rows are excluded from text-only automatic selection. Source counts and rights/provenance remain recorded separately from verified practice content.

No local QA fixtures, private source corpora, account records, credentials, generated DOCX files or APK build artifacts are included in this source commit.
