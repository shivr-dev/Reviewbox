# Membership 3.0 audit and implementation plan

## Existing (verified 2026-11-08)

- Supabase Auth identity and private account-scoped cloud records; web HttpOnly sessions and Pages native access-token handling.
- Private game reward codes, atomic claims and game grants; canonical legacy memberships.until; public review_game calls a private restricted game API.
- Existing learning algorithms, knowledge graph, GPA, outcomes, pack import/update, Qwen gateway and Navi UI registry.
- No subscription provider, verified payment callback, authoritative AI ledger, recurring agent workflow service or Learning Twin product exists. These cannot be represented as paid working features until connected.

## Delivery sequence

1. Central plan/feature/credit policy; private subscription, entitlement, credit-period, reservation/settlement, trial and event records. Server-only writes, account-scoped reads, replay protection and transactional quota enforcement.
2. Membership route and profile entry, editorial Free/Plus/Pro pricing and billing interval, real quota/status/history, provider-unavailable state, cancel-at-period-end and redemption.
3. Once-per-day dismissible native home promotion; independent Free Plus-trial ledger. No promotion in practice, exam or grading.
4. Server-recorded 14-day Plus eligibility and three nonrenewable Pro-preview tasks.
5. Extend actual Live UI collection filtering/sorting/registered scrolling/scientific highlighting/Mol* controls; then reusable authorized agent task execution, durable workflow definitions/runs and read-only longitudinal Twin summaries/simulations using existing learning code.
6. Role, quota/refund/replay, cancellation/expiry, migration, downgrade retention, desktop/mobile UI and real endpoint checks.

## Migration and integrity

- Preserve legacy SuperReview expiry and all original records. Map active legacy subscriptions to Plus through their existing expiry, with a minimum documented transition grace period. Keep legacy purchased cosmetic ownership and legacy paid perks through the original entitlement period; never advertise new paid lives or grant learning XP for purchase.
- Preserve GPA, scores, events, packs, knowledge graphs, equipment, XP and local/offline learning. Downgrade pauses advanced operations; it never deletes configurations or study data.
- Keep existing BYOK/private-key compatibility, but never treat client-visible configuration or local game grants as membership authority. Platform-funded Navi must use an authenticated server gateway and authoritative reservations. No public frontend bundle may contain platform model credentials.
- Providers remain explicit adapters, unavailable until configured. No fabricated checkout success, unverified webhook, client-written plan/quota, or paid feature claim without implementation.

## Risks and required controls

- Pages currently performs model calls through client-held private configuration. Commercial quota enforcement requires a protected server execution path, not just a frontend quota counter.
- Existing core pack update/merge features are already working. Basic safe update and data export remain available; no existing study content is removed to create a paywall.
- Real scheduled agent work requires server scheduling and scoped data reads, not browser timers advertised as background automation.
- Model and strategy estimates remain explicitly estimates, not guaranteed GPA/exam outcomes.
