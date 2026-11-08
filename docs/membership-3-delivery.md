# Membership 3.0 and Live UI delivery status — 2026-11-08

## Shipped in this increment

- Central Free / Plus / Pro policy and real private server subscription records. Calendar-month credit allowances are 60 / 500 / 1,800, with anchored UTC monthly periods for annual access too.
- Fresh Supabase identity validation, private server-only reservation/settlement/refund ledger, per-account transaction locks, duplicate-request fingerprints and cached final response replay. Quotas and trial counters are not client-writable. Failed calls release reservations; interrupted calls expire after 15 minutes. Rate limits are enforced in the database.
- Explicit three monthly Plus trials and three lifetime Pro Agent previews after 14 continuous Plus days. A successful trial may apply its own reversible UI tool using a short-lived, account-bound receipt, without charging a second trial.
- New and legacy redemption compatibility, current status/expiry/history, admin-only code management, cancel-at-period-end. Legacy SuperReview ownership and expiry records remain intact; active legacy subscriptions receive a Plus transition. Old codes still redeem. New paid-heart codes are no longer minted.
- Membership page, profile-account membership row, monthly/yearly pricing, true credit meter, collapsed redemption/history, independent workflow/Twin views, server-role-driven admin visibility. Free-only daily dismissible home promotion; none in practice or exams.
- Two genuine read-only Pro workflows: weekly study summary and upcoming-exam check. Definitions and runs are durable, account isolated, editable, pausable, recoverably removable, manually retryable, and weekly scheduled by pg_cron. Downgrade prevents execution while preserving configurations and reports. Reports explicitly use synced records and do not recompute or change mastery/GPA/scheduling.
- Read-only Learning Twin reuses computeMastery, memoryFingerprint, examGpa, weeklyLearningGpa and dailyStudyPlan. Changing a hypothetical time budget never writes back to the actual plan. It does not promise future scores.
- Navi Live UI now controls real material search/subject filters/sorting, registered exact content targets (including paginated rows), reversible mathematical point/circle/function highlighting, force/ray highlighting, existing 3Dmol atom highlighting, and Mol* representation/camera/reset. Unknown IDs and protected assessment controls are rejected. Current disclosure phases determine which scientific IDs exist. No arbitrary DOM selectors, JavaScript, HTML, scientific coordinates or formula mutation are accepted.
- No changes to the core learning algorithms, fixed grading or SOLO rubrics. Existing manual/core capabilities remain available.

## Validation actually performed

- 70 automated checks passed across Navi/context/storage/actions, gateway authority/refund/replay, pure Twin projection, actual rendered SVG highlight, scientific diagram and publication regressions. TypeScript and the Pages production build pass.
- Live database rollback checks covered ledger ownership/privileges, reserve/replay/refund, code compatibility, cached final result replay, workflow duplicate suppression and downgrade retention. Test transactions were rolled back.
- The deployed membership Edge endpoint returns 401 for anonymous/invalid authentication and 403 for an untrusted origin.
- Real browser checks: monthly/yearly prices; authenticated Free status and credit count; updated account/profile hierarchy; collapsed redemption; independent workflow route and browser Back; actual material filtering/sorting; 390px layout with no horizontal overflow. Redeem input/button measured equal top and height (42px).
- Local screenshots live only in ignored work/: membership-aligned.png, membership-layout-fixed.png, navi-live-materials.png. They are not seeded content or a concept mockup.
- Production assets were searched for the isolated preview fixture identifiers; no fixture files were found. The preview server now serves the actual built app without injecting example records. The user explicitly chose to keep previously copied preview fixtures in cloud records. Nothing was archived or deleted.

## Not claimed complete

- No payment provider was selected or configured. Checkout is deliberately unavailable; there is no simulated payment, unverified payment webhook, or fabricated subscription success.
- Platform model credentials are not included in source or public assets. The protected gateway supports server credentials or the existing user-owned configuration. Live model quality across every paid mode has not been end-to-end certified; provider-response tests use explicitly mocked responses.
- Additional workflow types (automatic pack update review and comprehensive content-quality agents), full longitudinal strategy experiments, and every advanced feature described in the long-term membership specification are not yet implemented. The UI exposes only the two working workflow types.
- Scientific highlighting is limited to the actual registered object categories above. Arbitrary molecular residue/chain selection and unsupported biological-pathway highlighting are not advertised as working.
- The new membership namespace has eight locale resources. Several detailed secondary explanations still use English fallback outside Chinese; a complete language review remains necessary.

## Operations

Run `node scripts/build-membership-edge.mjs` before deploying the bundled Edge entry from work/membership-edge/index.js. It uses fresh Auth validation and therefore disables the gateway's legacy JWT verification switch; authentication is enforced by the handler. Use deno.json as an explicit import-map path on function updates.

`node scripts/serve-local-preview.mjs 3021` serves pages-dist without fixtures. All QA assets, generated bundles, credentials and user records remain outside the source publication list.
