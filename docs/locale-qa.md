# Reviewbox 2.0 locale asset check

Checked against the current source on 2026-11-01. This check covers authored product text, not imported learning content.

## Asset validation

- Eight locales: zh-CN, zh-TW, ja, ko, en, es, fr, ru.
- Twelve namespaces and 2,314 keys per locale, including the four knowledge-count plural keys.
- Compared 18,512 values for exact key parity, nonempty strings and interpolation placeholders: no discrepancies.
- Corrected all eight descriptions of clearing study data. The text now states that the account remains; it no longer claims that an example subject framework remains.
- Added `subjects:knowledgeCount_one/few/many/other`. Russian has distinct `1 тема`, `2 темы`, `5 тем` and fractional `темы` forms. The component should call `tr('subjects:knowledgeCount', {count})`.
- Curated 48 translations across English, Japanese, Korean, Spanish, French and Russian. Corrections include submission/grading instructions that previously sounded like the student should grade the work, subject-weight terminology, verified consolidation exercises, JSON repair wording, exam saving and equipment reforge choices.

## Remaining source findings supplied to the application owner

Asset parity does not prove that every visible string calls the translator. The following source locations still contained direct authored strings at the time of this read-only audit:

| Area | Location | Issue |
|---|---|---|
| Profile status | components/you-view.tsx:202–213 | Sync status computed in Chinese before rendering |
| Profile overview | components/you-view.tsx:295–315 | Default space/status, daily-minute suffix and theme names |
| Account/data details | components/you-view.tsx:358, 619–621, 701–709 | Unsigned state, backup counts, connection results and some error messages |
| Study plan | components/study-plan-view.tsx:452 | Recommended duration assembled with Chinese fragments |
| Workshop | components/workshop-experience.tsx:127, 214, 540, 619, 715, 728, 885 | Materials, lock state, discovered state, filters and memory help text |
| Library/device | components/public-pack-library.tsx:30; components/watch-package-card.tsx:19 | Fallback descriptions and device authorization suffix |
| Word export | components/booklet-export.tsx:9, 15–16 | Initial title and progress/error messages |

These locations were reported for wiring by the main agent. This document is a source audit snapshot, not a claim that the locations remain unfixed in the final build. Imported course titles, question text, explanations and user-selected names must remain in their original language. Learning-state enums must not be translated in algorithm comparisons or storage.

## Limits

No browser automation or live locale switching was performed by this asset task. Layout, immediate rerender, persistence and error-path acceptance remain application-level checks. Most existing long explanatory translations were not professionally proofread; the curated fixes above address observed semantic mistakes rather than certify native editorial quality for all eight languages.
