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
