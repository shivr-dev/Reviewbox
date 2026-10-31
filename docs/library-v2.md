# Library 2.0 — 2026-10-31

The library now uses Materials / Questions / Packages. Packages default to installed personal content; discovery and device synchronization are separate views. The shared import dialog handles file import, pasted content and manual question import. Backup/export remains independently accessible. Search and pagination are implemented for materials, questions, installed packages and discovery; installed/discovery lists also sort. Descriptions, change logs and version actions live inside compact package rows.

## Update safety

`previewInstallPack` compares package identity, version and canonical SHA-256 content. Incoming source content and effective installed content have separate hashes, so retaining a personal edit does not falsely describe the installed package. Semantic equality ignores verification and publication metadata. Identical content preserves verification; changed/new questions require verification. Unresolved personal/foreign-content conflicts block installation. Cross-kind/reserved IDs are rejected.

The actual installed membership is persisted. Retired exclusive questions receive tombstones; shared questions and explicitly retained personal content survive. Knowledge nodes remain available as historical context. No answer, score, GPA or game record is rewritten. Active tasks block replacement of their questions.

Content, manifest, version history and sync queue are committed in one IndexedDB transaction. A stale preview or storage write failure aborts it. Historical snapshots are split into bounded chunks to fit existing synchronization limits. Missing history chunks block further updates. Historical bodies are only hydrated in the package manager, not during routine learning projection. Current-version undo restores the exact previous rows, protects later edits, and preserves knowledge context. Older versions use the normal diff/conflict workflow.

The old `review-core` sample is absent from installation, discovery-publishing and device download entry points. `review-framework` remains installed. The old prefix-based automatic deletion of unused `core-*` questions was removed: entering a new account no longer silently deletes existing sample questions. No destructive sample purge is included.

## Watch delivery

The private-package exporter rejects incomplete membership instead of silently emitting a partial new version. Native cache replacement removes obsolete exclusive cached questions, retains shared questions/answer evidence/scores, and blocks replacement while an active task uses the package. Same-version hash differences can show an update. Watch 0.1.6 Alpha (versionCode 7) is built and its public Storage download is verified.

Important remaining boundary: the existing native **public-pack install RPC** preserves an already-installed private copy rather than resolving package-version conflicts. Public update review/conflict resolution is provided on the web; after confirmation, downloading the personal package supplies that updated account version. This work does not claim a native per-question conflict editor or atomic multi-device package publishing. Local installation is transactional; the existing cloud synchronization still sends bounded batches, and incomplete remote packages are rejected until synchronization finishes.

## Evidence

- Package/store safety: 9 passing tests, including unchanged verification, upgrade/archive/undo, private edits, foreign IDs, immutable history, stale previews, injected disk failure, active-task guards and legacy manifest normalization.
- Library interaction: 3 passing tests; real store-backed conflict submission/result display, three-tab/no-sample layout, search and pagination beyond the first page.
- Existing learning/game/course/exam/GPA regression suite: 113 passed.
- Shared watch/gateway suite: 26 passed, including refusal of stale/conflicting public-package installation before any database write.
- Android API 30: 7 instrumentation checks passed (offline packages, package synchronization/resume, runtime GPA/scoring parity and backend timestamps). The demo's generated build date is normalized to the test's fixed clock; production GPA rules were not relaxed.
- TypeScript and Pages production build checked.
- Real browser QA at default desktop size, 390×844 and 768×1024. Mobile/tablet document width equals viewport width. A real isolated update retained the personal edit, added one question, archived one question, and displayed one pending verification.

Screenshots are in `outputs/library-v2/`. `before-library-qa.png` renders the archived pre-reform LibraryView source using independent QA data; `after-library-qa.png` uses the new component with the same QA library. `after-packs-desktop.png` and `after-materials-desktop.png` capture the actual local workspace. Diff, result, phone and tablet captures use the isolated QA origin; no testing packages were installed into the personal account.

Formal acceptance still requires actual OWW231 hardware and live cross-device/conflict testing. These passing checks are not a claim that the entire Watch V2 specification is complete.
