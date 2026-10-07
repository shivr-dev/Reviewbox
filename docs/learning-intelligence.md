# Personal learning intelligence

All seven capabilities use the current account's local event stream. They run offline and require no AI calls for analysis. Existing schemaVersion 1 packages and historical events remain compatible. New question and event fields are optional; events remain immutable and sync using the existing private record queue.

## Cognitive diagnosis

`cognitiveAttributes` is a task requirement matrix, not a learner-selected error label. Eight supported attributes cover symbolic reasoning, calculation, evidence, vocabulary, syntax, recall, causal reasoning and application. Missing annotations are inferred conservatively from node/skill names and tags. Unknown mappings are excluded.

The estimator enumerates up to 256 conjunctive latent profiles, with fixed guessing priors based on response format and a fixed slip prior. Recent evidence is weighted more strongly; self assessment, hints and suspicious correctness have lower weight. Repeating the same item on one day contributes only once. At most 120 recent observations per subject are considered. Fractional rubric scores use a weighted Bernoulli approximation.

Each attribute requires six observations, three distinct tasks and two learning days. Attributes which always co-occur are not individually diagnosed. Normalized error responsibility is shown as an estimated share, not as a measured fact about the student's reasoning steps. Identifiable weakness raises related review priorities. This is DINA-inspired, not a population-calibrated diagnostic assessment. Background: https://pmc.ncbi.nlm.nih.gov/articles/PMC5965550/.

## Correctness verification

An objective correct answer is marked provisional only when thinking time is unusually short AND pre-answer confidence is low. A fast fluent correct answer alone never triggers it. Pinyin self checking is excluded. Provisional evidence cannot advance a spaced mastery checkpoint and has reduced mastery weight.

At most one additional cross-check per review session reuses a verified, unexpired, different variant of the same node × skill with comparable difficulty. A future queued variant can serve as that check. Its source event link is persisted with the session, so reloads resume correctly. No recursive verification is inserted. If no verified variant is available, the signal stays pending; no hidden AI spending occurs.

## Transfer

Questions can share stable `conceptIds` across subjects and use distinct `contextId` values. Conservative built-in mappings cover vectors, proportion, conservation, causality, evidence and structure/function. Cached transfer candidates require a previous unassisted successful source recall at least one day ago, a verified target in another subject or explicit different context, and comparable difficulty.

Explicitly preparing a new transfer question can target a related node in a different subject. Generation uses the target node/skill and shared concept; the existing independent solver/judge path also checks conceptual consistency. Mathematics still requires three isolated solvers. Each response updates its actual target node × skill; it never awards mastery to every related node. Concept transfer is considered verified only after three successful reliable attempts in at least two contexts and two days. New generation consumes quota; cached exercises do not.

## Memory fingerprint and policy evolution

Families are formula, vocabulary, fact and reasoning. A delayed trial follows an unassisted correct response in the same node × skill, after 0.5–180 days and within one difficulty level. An intervening failure terminates the previous anchor. Hinted, suspicious and pressure answers are excluded. Event snapshots preserve content family when questions change or are removed.

Individual timing is enabled after six delayed trials on three days and at least two interval bins. A shrunk exponential retention estimate adjusts new scheduled intervals conservatively, within 0.65–1.35 of the base family interval. Sparse curves are explicitly displayed as prior estimates.

Three policies use stable hash assignment per node × skill: cautious (0.8 interval), balanced (1.0), expansive (1.2), with correspondingly different confidence weights. The event stores the assigned policy and interval factor. Delayed recall after that assignment is compared; historical events without assignment are excluded. A global winner is adopted only after every arm has 20 trials over four skills, and the leading lower uncertainty bound exceeds every other upper bound by 0.03. Knowledge difficulty remains a possible confound, so this is disclosed as personal strategy comparison, not a rigorous causal A/B study. Spacing checkpoint requirements, daily gain caps and failure handling still take precedence.

## Challenge threshold

A regularized logistic ability adjustment uses the latest 30 unassisted, non-pressure, non-suspicious responses. Five difficulty predictions combine the ability prior and local outcomes, constrained to be monotone. Queue selection and automatic AI difficulty aim for roughly 75% success, not guaranteed success. Manual difficulty remains available.

## Pressure testing

The separate timed interface uses local choice, blank and matching questions, prioritizing weak skills and comparable baseline evidence. It excludes pinyin and official exam-only content. Questions/answers are checkpointed privately; the persisted deadline continues after exit/reload. Expired recovery submits unanswered items as timed out. Events, report and completed draft are saved in one local transaction with stable IDs.

Reports compare the same node × skill and similar difficulty against preceding non-pressure, unhinted objective/rubric results from different items in the last 60 days. Baseline requires three observations, two items and two days. Outcomes are baseline weakness, pressure-sensitive signal, stable performance or insufficient evidence. A single run cannot establish that pressure caused the loss. Pressure responses update skill mastery but are excluded from ordinary memory and policy fitting.

## Verification

`node scripts/test-intelligence.mjs` covers model abstention, provisional correctness, variation/reload linkage, duplicate-event replay, fingerprints, conservative policy switching, flow estimates, concept links, pressure matching, import compatibility, account isolation and a manual single-question UI flow. Fetch is blocked in the UI test to enforce zero AI calls. Existing core regression tests remain in `node scripts/test.mjs`.
