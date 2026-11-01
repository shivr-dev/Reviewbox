# Feedback, privacy and onboarding

Profile → Data and privacy contains the statistics toggle, public Feedback form and versioned terms. Onboarding v3 adds terms → optional account connection → a beta notice after the original learning setup. Existing learning, game and cloud records remain in their existing stores.

## What is collected

Statistics default to enabled, but the client sends nothing before current terms are accepted. Opting out is immediate: clear the memory queue and abort requests. A timestamped preference is account-synced, with a local fallback and cross-tab updates. Account changes clear the buffer. Feedback is a separate voluntary public submission; its checkbox is never preselected.

Only allowlisted aggregate dimensions are accepted: day, feature area, event, phone/tablet/desktop, coarse visible-time bucket, app build and browser family. No account, device or session IDs, topics, questions, answers, grades, GPA, raw error messages, URLs, IPs or user agent strings are stored in these aggregates. The edge provider may maintain its own infrastructure logs.

Useful measurements include practice starts/completions/saved exits, import review versus installation, export generation versus a download click, registration awaiting confirmation and successful sign-in. These locate workflow friction and compatibility regressions across builds. They are approximate counts, not unique-user funnels; a download click does not prove the file saved, and completion statistics are not learning outcomes or mastery calibration data.

Aggregates expire after 90 days. A daily HMAC of a network address is used only in a separate abuse-limit table, expires after 7 days and is not joined to statistics or reports. Feedback text is cleared 30 days after successful publishing; receipts expire after 90 days. Scheduled queue processing also enforces retention when no users visit.

## Automatic Issues delivery

`review-feedback` accepts consented reports, validates their shape, limits size/rate, and returns a random receipt. Its private tables have RLS and no anonymous/authenticated role access; only a service-role invoker RPC is callable by the backend. Receipt status requires possession of its 256-bit secret. No GitHub credential is in client assets.

`.github/workflows/feedback-issues.yml` runs on deployment, manually, and approximately every ten minutes. It authenticates to the edge with short-lived GitHub OIDC. The edge verifies issuer, audience, signature, expiration, immutable repository/owner IDs, main branch and exact workflow path. The workflow uses its scoped `GITHUB_TOKEN` to create Issues. Queue leases, retry backoff and stable issue-body markers avoid duplicate creation after uncertain acknowledgements. GitHub scheduling may be delayed; receipts stay honest about queued/retry/submitted states.

The Issues worker never executes submitted text or interpolates it into shell/Actions code, and does not print report contents or tokens in logs. Published issue bodies contain only the confirmed report and voluntarily included coarse environment fields. Original private learning stores and learning algorithms are unaffected.

## Operations

Deploy the `review-feedback` Edge Function with its three source files and gateway JWT verification disabled: public ingest is explicitly bounded, while queue operations perform their own OIDC authentication. Apply the three feedback/insight migrations in timestamp order. No new repository or Supabase secrets are required. Keep the private schema out of the Data API exposed-schema list.

Feedback categories map to existing GitHub labels: `bug` → `bug`, `suggestion` → `enhancement`, `question` → `question`. Legacy reports default to `bug`. The `close-answered.yml` workflow closes an open issue as completed when it receives `Answered 已答`, including reopened issues that still have the label. Deployment/manual runs also handle previously labelled open issues. Submitted text is never used as workflow code.

Inspect aggregate summaries through privileged SQL against `review_product.usage_daily`. For example, compare export error/ready counts by build/browser, import review/complete counts by build, and practice start/complete counts by device. Do not infer individuals or achievement changes from these aggregates.

Verification includes contract/privacy tests, in-flight opt-out cancellation, account isolation, signed OIDC trust tests, retry idempotency, disposable onboarding UI tests, and a rolled-back database transaction exercising submit/deduplicate/claim/ack/status/metrics. No QA reports or learning fixtures are included in production seeds.
