# Learning Experience 4.0

## Existing capabilities and implementation boundaries

| Area | Existing implementation | Gap and integration |
| --- | --- | --- |
| First visit | Onboarding v3 saves daily minutes and subject weights, requires the usage agreement, and offers optional account connection | Replace the linear tour for new users with an account-scoped Check-in draft. Existing user records and incomplete v3 tours remain readable. Offer the new Check-in from Learning Preferences. |
| Study | Study Director, queue ranking, dependency links, practice, and assessment already use the same question and evidence records | Add a bounded Sprint planner over the existing queue and a separate parent session. Existing practice/assessment produce the same immutable evidence using stable child session IDs. |
| Time | Review tracks active answer time and idle signals. Assessment saves answer drafts | Sprint uses a foreground budget clock with persisted checkpoints. Answer time is reported separately. Leaving the workspace pauses the budget. |
| Exams | Scheduling, scope search, editing, cancellation, scores, deferred reminders, and history already exist | Link Sprint sessions by exam ID. Add optional post-exam feedback to the exam record and display linked reports. |
| GPA | The existing evaluator supports a formula, scale, credit weighting, and date range. Its default treats score percentage as a proportional estimate | Retain saved formulas and historical calculations. Separate evidence-based exam percentages from estimated and explicitly configured GPA. Add explicit grade bands without assuming a school's thresholds. |
| Storage | IndexedDB and the existing private record sync carry settings, exam, event and job payloads | Use the existing namespaces and row shapes. Use atomic writes for related changes and stable IDs for retried operations. Concurrent edits on different devices still use the existing sync conflict policy. |
| Home | Today already links to Study Director, GPA, equipment and Navi | Add an upcoming exam briefing and post-exam follow-up. Keep one leading action. Use the adaptive recommendation as the main action outside the exam window. |

Important failure cases include unintentionally replacing the existing active study session, recording unattempted expired Sprint questions as wrong, retrying a save after evidence arrived, editing a cancelled exam or a stale scope, and changing the meaning of stored GPA. Scoped practice reuses existing mastery, dependency and quality data. Self-reported exam feedback is an investigation cue only.

## Acceptance focus

- New and returning users, privacy opt-out, conditional exam setup, optional sign-in, reloading a draft, and no duplicate exam on repeated completion.
- 10- and 30-minute plans, scope fidelity and coverage, thin or empty banks, self-check selection, and step recovery after interruption.
- A paused/expired Sprint preserves existing answer events, excludes unfinished attempts from the report, and leaves ordinary study and formal exams intact.
- Deferred grades remain missing, an entered zero is valid, historic calculations retain their value, and reports link only evidence from the correct exam.
- Verify an isolated local preview without seeding or synchronizing data into a real account.
