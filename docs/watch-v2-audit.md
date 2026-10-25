# Reviewbox Watch V2 — implementation audit

Latest delivery and synchronization verification: [0.1.5 Alpha checkpoint](watch-0.1.5-checkpoint.md). The 0.1.1 inventory below is retained as an earlier audit, not the current release status.

Checked 2026-10-25 against local source, Supabase migration/function inventory and GitHub main. This is a development checkpoint, not a release acceptance report.

## Current preview checkpoint — 0.1.1 alpha

- Removed the system-WebView dependency after reproducing its startup crash on the API-30 China Wear emulator. The packaged QuickJS runtime executes the existing shared TypeScript learning algorithms.
- Actual round emulator: 454×454 pixels, density 320. Native test journeys cover flashcard flip, long press, explicit recall self-rating, guarded upward advance, independent long-text scrolling, edge swipe back, save/resume, and completed-session persistence. Upward swipes do not fabricate correct answers.
- Home, welcome and recall self-rating are fixed launch/action surfaces. Secondary menus and long reading screens remain scrollable. Per-destination saveable state retains list reading position.
- Native instrumentation: three tests pass at 1.3× font scale, following successful normal-scale engine and gesture tests. The runtime test verifies real GPA, independent weekly GPA fields, authoritative objective scoring, cross-date timezone behavior and quoted text remaining data. Native unit tests: four pass. Web pairing tests: two pass; TypeScript checking passes.
- Signed, non-debuggable **test** APK: `outputs/watch-alpha/Reviewbox-Watch-0.1.1-alpha.apk`. It uses the existing Android debug/test certificate for upgrade continuity, not a production certificate. ARM64, ARMv7, x86 and x86-64 libraries are packaged. Release vital checks pass with one documented exception: the unused Lifecycle MutableLiveData detector is disabled because its Kotlin analysis API crashes with AGP 8.7; other detectors remain enabled.
- Web preview remains read-only. Local HTTP and its stylesheet return 200. Browser automation infrastructure was unavailable, so no new browser screenshot acceptance is claimed. Native screenshots are generated from actual Compose instrumentation.
- Supabase pairing progress migration is deployed and `review-watch` v5 is active. Web approval remains visible as pending until the watch actually claims it; expired approvals never appear connected. Native pairing survives app switching/process recreation and ignores a late response after cancellation. Real account/OWW231 pairing still needs testing.

This checkpoint is a runnable preview, not completion of the full V2 specification. Course consolidation, specialized exams, handoff, platform Tiles and the remaining items below still require work. No APK was uploaded to Storage and no public download manifest was enabled at this checkpoint.

## Verified foundation

- Target is mainland OWW231 / ColorOS Watch V7.1 / Android 11, not international Wear OS.
- Kotlin / Compose for Wear Material 3 project exists. Debug and non-debuggable test Alpha APKs compile successfully. Four native unit tests pass (palette contrast, token/hash interoperability and gesture/evidence guards).
- Shared TypeScript GPA, learning GPA, mastery, reward replay, question scoring and Study Director adapters exist; twelve targeted Watch tests passed before this runtime/UI checkpoint. Native runtime parity coverage is listed above.
- Custom short-lived pairing, explicit web approval, hashed device tokens, refresh rotation/retry, owner checks and revocation are implemented. Four device migrations are deployed.
- Database protocol test uses synthetic users and rolls back. It checks unapproved pairing, account ownership, cross-account revocation rejection, upload receipts, replay, conflicting command identity, rotation and revocation.
- Native encrypted SQLite/Keystore storage, offline command queue, active practice restoration and conditional objective short tests are implemented in source.

## Outstanding work

| Area | Current state | Missing / acceptance gate |
|---|---|---|
| Deployment consistency | Supabase `review-watch` v5 is active; last checked GitHub main was `3a35ae8e33cd37759d0cc8009950e80f51c654d9`; current 0.1.1 APK is local | Current Watch source/UI changes have not been pushed to GitHub; public APK download is not enabled. |
| Pairing E2E | Gateway and database protocol checked | Real web-account approval on OWW231, relaunch, refresh and remote unpair wipe need end-to-end verification. Credential Manager is not established as compatible with this China OS. |
| Offline/conflicts | Receipts and stale grade edits handled; confirmed unauthorized/revoked-device responses clear native protected state in source | User-facing reset/conflict recovery is incomplete. Real-device revocation/wipe and network-failure distinction need E2E verification. |
| Study modes/preferences | Modes are read from shared settings | Native Auto/Guided/Manual switching, daily minutes, weights and explicit Auto-start settings are not editable yet. |
| Course loop | Course/section lists and a basic reader exist | Structured content extraction is incomplete. Native checks, section progression, immediate consolidation and delayed verification are not yet connected. Reading JSON as prose is a bug, not a completed course reader. |
| Assessments | Objective initial/short/pressure sessions are implemented | Specialized/manual assessment workflows and formal multi-section simulations are not connected. Unsupported actions still have an explicit `task-pending` screen. Pressure countdown/expiry UX needs completion. |
| Question interaction | Choice, text input, explicit self-checked recall, native flip/long-press/upward advance and separate long-text reading supported | Matching needs a native interaction instead of raw JSON. Math rendering, diagrams/media and fuller long-course adaptation remain. |
| Scores/GPA | Existing exam score entry and shared GPA computation; read-only exam scope/target and GPA rules | Per the owner's later instruction, creation/editing/cancellation of arrangements and GPA formula editing remain on the web, not required on the watch. Score trends and E2E verification remain. |
| Notes/materials | Lists and basic reading | Native note creation/editing and some material formats remain incomplete. |
| Study Handoff | Device-specific session IDs and web resume routing prevent accidental ordinary web rendering | No actual offer/claim/return protocol, ownership lease or web “continue on watch” operation yet. This innovation is not implemented. |
| Knowledge Orbit | Real node state visualization and navigation exist | Penguin/review linkage and fuller explanatory interaction remain to be added. |
| Rewards | Shared XP/hearts/streak/skin projection | Native reward/chest flow, celebrations, achievements and user controls need completion. Owner permits simpler chest animation; reward correctness still required. |
| Learning packages | Web ZIP/scope/request UI and native download/hash/cache code written; scoped pull migration deployed | Gateway redeploy, current APK rebuild and actual selection/download/offline/removal E2E remain. More package validation and account-isolation tests are needed. |
| Tile / system integration | Official China compatibility research underway | No Tile service is implemented yet. Google Tile support cannot be claimed on ColorOS Watch. OPPO-specific card access/SDK requirements need verification. |
| Notifications | Web preference stored | No complete native reminder scheduling/delivery/permission flow yet. |
| Downloads/release | Watch-only landing detection and a disabled manifest exist | No APK uploaded to Supabase Storage. `watch-release.json` is `testing` with an empty URL. Signing, upload, checksum verification and GitHub download entry activation remain. |
| Physical QA | Round API-30 emulator tests and larger-font screenshots checked; no physical OWW231 connected | OPPO physical clipping, low power/background, process death, offline recovery and gesture acceptance remain. |

## Next implementation order

1. Close deployment/version mismatches and synchronization safety gaps.
2. Finish course and assessment progression, handoff, settings and exam controls.
3. Finish package E2E and platform-appropriate Tile integration.
4. Rebuild/test the actual deliverable, publish to the requested APK bucket, enable the single watch download button and provide the owner a physical-device test checklist.

Compilation and preview interaction alone are not acceptance. Original web learning, GPA and account data must remain compatible throughout.
