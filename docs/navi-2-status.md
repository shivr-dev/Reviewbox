# Navi 2.0 — current testing build

This build preserves the five main navigation entries and the existing learning,
grading, exam, GPA and AI gateway systems. It is a testing checkpoint, not a claim
that every Phase 2 acceptance scenario has passed.

## Connected

- One global, account-isolated tutor with persistent conversations and source
  version/quote checks. Existing course conversations can be continued.
- Concept, problem, writing/rubric, study and exam coaching preferences, with four
  help depths. Tutor writing comments are explanations, not official regrading.
- Per-conversation opt-in to bounded relevant attempts, draft steps, existing
  grades and related exam goals. No full-history or draft-image upload.
- The existing interactive practice form supports comparison, focus, derivation,
  evidence and study-board panels. Safe commands are applied through a strict
  action registry; AI proposals require acceptance. Undo, reset, panel ordering,
  width, readable font size, diagram magnification and saved subject layouts work
  through React state. Unknown actions and unsupported targets fail explicitly.
- The existing 3Dmol viewer can switch among its supported molecular display modes.
- Tutor explanations have a confirmation step before saving to subject notes.
- Analogous practice reuses the existing bounded generation / independent solve /
  judge pipeline. Preview-only jobs do not insert questions. Confirmed, checked
  results install into a new or existing Navi personal practice pack; public packs
  cannot be modified by this control.
- Eight locale resources include the added tutor/workspace controls.

## Not complete / not yet verified

- The full Live UI action catalog is not implemented across every page. In
  particular arbitrary material filtering/sorting/scroll targets, scientific
  object-level highlighting/rotation and Mol* view control are not available.
  They are not advertised as executed.
- Rich course/material multi-component boards and automatic layout suggestions
  are not connected. Manual changes are protected at the controller boundary.
- Practice generated with outstanding diagram/rubric review is blocked; the
  complete inline review handoff still needs integration.
- Destination selection currently supports dedicated Navi personal practice packs,
  not modification of third-party or public-derived packs.
- Live Qwen quality and all ten end-to-end tutor scenarios need testing with a
  configured account. The local preview used for development had no AI connection.
- Full responsive/accessibility and all eight live-language scenarios are pending.

## Implementation

Context: `lib/navi-context.ts`, `lib/navi-evidence.ts`.
Protocol and state: `lib/navi-ui.ts`.
Tutor UI: `components/navi-workspace.tsx`.
Real practice layout: `components/navi-learning-workspace.tsx`.
Staged practice: `components/navi-practice-preview.tsx`, preview-only option in
`lib/ai-client.ts` (the existing scoring/generation logic is unchanged).
Private conversation/layout storage reuses the existing `job` record and sync
namespace. No new public permission or private history endpoint is introduced.

## Conversation-integrated controls (2026-11-08)

- Navi uses the right-hand dock and fullscreen mode in the existing application. Immersive practice leaves room for the dock.
- GPA rules, exam create/edit, daily time, subject weights, learning mode, and cancel/resume exam scheduling use validated proposals and explicit confirmation. Cancelling a schedule preserves the exam record and real result.
- Configuration, note, UI action and practice previews are embedded in the conversation scroll, under their originating assistant message where available. The tool body has no independent scrolling or sticky confirmation footer. Switching conversations clears pending configuration previews.
- Persistence uses account-scoped atomic records/queue writes, stale-preview rejection and operation receipts. Learning algorithms and real grades remain protected.
- Type checking and production build passed after this integration. Live cloud-language interpretation remains unverified in the unconfigured local environment.

## Tutor feedback, reliable responses and online references

- Understanding checks are one short, explicit conversational question. The answer and targeted feedback stay in the same thread; no grade, mastery, event, XP or scheduling write occurs. A check response cannot produce UI/configuration actions.
- Text selected in the real learning canvas can open Navi with a visible, removable quotation. Protected assessments and editable form fields are excluded. Sending remains explicit.
- Setting receipts show changed fields and support account-scoped atomic undo. Undo rejects later edits to the same fields, retains unrelated later edits and real exam results, and cancels a newly created schedule instead of deleting the exam. Older receipts without a change snapshot have no undo authority.
- Navi has its own final-response parser through the existing AI gateway. It ignores separate reasoning, handles complete think prefixes and text blocks, rejects truncation/multiple competing objects, and never displays internal reasoning. Strict validation remains in place. Format/citation failures retry at most once, within the existing request deadline; auth failures do not retry. Other grading/generation callers retain their existing parser.
- Citation verification checks actual decoded JSON text values and normalized whitespace, retaining exact source ID/version and wording checks. Invented quotations are still rejected.
- Explicit online-reference lookup searches Wikipedia introductions through its public CORS API. Only reviewed keywords are transmitted, without cookies or account/history/AI credentials. Users pick a source before it enters the private conversation. Revision URLs, attribution and source type persist with the conversation and citations. This is a bounded encyclopedia lookup, not general web search, official exam guidance or an external-page crawler. Network content is untrusted data.
- Core/interaction tests: 30 passed. Type checking and Pages production build passed. Actual local UI: daily-time save/receipt/undo and live Wikipedia retrieval verified. Live Qwen quality and complete model-powered tutoring remain unverified locally because no AI service is configured.
