# Watch 0.1.5 Alpha — test and synchronization checkpoint

Checked 2026-10-25. This checkpoint supersedes the temporary 0.1.4 practice-only policy, following the owner's instruction that the watch should conduct tests directly without redirecting to the website.

## Implemented

- Connected-account native selections start assessment sessions. The watch can execute objective initial, consolidation, delayed-verification and supported pressure tests, save answers, resume its own unfinished test and generate the shared test report. Legacy practice records and queued commands remain compatible.
- Cloud planning uses the complete account library, while transferring only selected-task questions and the original resume job. Physical `active-session` aliases resolve to their logical session IDs; newer canonical completion records supersede stale active aliases.
- Foreground synchronization updates content and recommendations without replacing an ongoing answer. Public packages can be selected in offline content; private packages retain their original synchronization path. Public downloads retain unverified status until properly checked.
- Android 11 parses PostgreSQL timestamps containing microseconds and explicit offsets. The gateway also normalizes credential expiry for older clients.
- Web chest eligibility uses durable completion evidence, surviving replacement of the old active-session slot. Existing minimum effective-thinking evidence, three-tap claim and duplicate-reward protections remain. Ineligible settlements explain the reason rather than navigating into an unusable chest.

## Verification

- Shared Watch/gateway tests: 25 passed.
- Learning-game and settlement regression suite: 113 passed.
- TypeScript check: passed.
- Android debug, instrumentation and non-debuggable Alpha builds: passed.
- API-30 disposable round emulator: native package/cloud-plan/resume/answer/completion/report integration and shared runtime parity tests both passed. Native recovery was tested with a legacy physical row alias and an empty incremental pull.
- User preview emulator was upgraded in place to versionCode 6 / 0.1.5-alpha; account data was retained. Supabase `review-watch` version 10 is active.

## Scope and delivery

Local APK: `outputs/watch-alpha/Reviewbox-Watch-0.1.5-alpha.apk`.

SHA-256: `9d42e8918c0012e2b06081f639a3b6aa459faa4d9f09297d078c3d7a53ffa155`.

Specialized SAT/ACT/MAP multi-section simulations and cross-device assessment ownership transfer are not established by these tests. A foreign active assessment remains protected against duplicate submission. Actual OWW231 physical-device acceptance remains outstanding.

## Distribution update

The APK is uploaded to the public `reviewbox-releases` bucket at `watch/Reviewbox-Watch-0.1.5-alpha.apk`. An anonymous full download was verified against the local APK's SHA-256 and byte count (27,029,936). The public manifest now enables the watch-browser download landing page. Temporary upload authorization was closed immediately after verification; clients have no bucket write permission. GitHub Pages publishes and verifies this manifest alongside the application through the existing workflow.
