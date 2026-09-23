# Backend constraints and production gates

## Implemented enforcement

- **Identity and tenancy:** every protected request verifies the bearer token with
  Supabase Auth `/auth/v1/user`. Database reads carry that token and are filtered
  by RLS. Every write RPC derives the subject from `auth.uid()` and checks resource
  ownership; no service-role credential or local database is used.
- **Write boundary:** authenticated and anonymous roles have no direct
  INSERT/UPDATE/DELETE grants. Transactional `security definer` RPCs own all
  mutations and use a fixed `search_path`.
- **State and concurrency:** event writes use an expected-version CAS. Predictions,
  outcomes, and reflections are unique and immutable. A submitted prediction
  locks the event analysis snapshot. User hypothesis precedes AI alternatives and
  prediction; outcome precedes reflection. Every accepted mutation appends an
  event snapshot revision.
- **Idempotency:** RPC keys are scoped by authenticated user, action, request ID,
  event, version, and a database-computed JSON payload digest. Exact completed
  replays return the stored result before CAS; changed parameters are rejected.
  Prediction date syntax is checked at the API, while the database checks
  `dueAt > now()` only after idempotency replay lookup; this preserves replay of
  a previously successful prediction after its deadline.
  The current OpenAPI contract has no `requestId` in create, update, delete, or
  reflection bodies, so those endpoints accept an optional `Idempotency-Key`
  header and otherwise generate a per-attempt UUID. Durable client replay for
  those four operations therefore requires that header; this is a contract gap.
- **AI boundary:** consent, saved version, stage preconditions, one 75-second
  reservation per user, 20 user starts per UTC database day, five global active
  reservations, and 200 global starts per UTC database day are checked
  transactionally before a call. Global admission locks before the per-user lock.
  Finish, failure inside the deadline, and event deletion do not refund a daily
  admission. A terminal finish before the deadline does release that run's
  in-flight reservation so the next stage can start; there is no client RPC that
  releases quota by itself. Deleting an event does not release a still-open
  reservation. Admission starts survive event deletion. Runs have a 75-second lease;
  listing or requesting work expires abandoned runs. The DeepSeek client has zero retries,
  a 70-second timeout, and JSON-object output. Zod still rejects anything outside
  the stage schema.
  Candidates are returned for review and never mutate event decisions. Fresh and
  replayed output is projected deterministically so each stage can expose only
  its own candidate fields.
- **Privacy:** request bodies, bearer tokens, and narratives are not logged.
  Errors are mapped to explicit sanitized responses. Authenticated responses use
  `private, no-store`.

`finish_ai_run` is still callable by the owning authenticated user, because the API
uses that same user token. A user can therefore forge candidate output for their
own run and, by finishing it, also end the in-flight hold. The daily admission
row is not refunded. These records still cannot be treated as proof that the
server model produced the output. A separate worker credential, with finish
revoked from `authenticated`, remains required before run output is trusted.

## Supabase transactional verification plan

Run after applying
`supabase/migrations/20260322120000_context_lab_backend.sql` and
`supabase/migrations/20260923130000_questions_corrections_reservation.sql` in an isolated test
project. Start with `tests/backend/database.sql`; it uses two synthetic
transaction-only `auth.users` rows, local JWT claims, and a final rollback:

1. Create one event as user A. Confirm A can select it and user B cannot select,
   update, delete, or address it through every RPC.
2. Attempt direct INSERT/UPDATE/DELETE on all public tables as authenticated and
   anonymous roles; all must fail. Confirm direct quota-counter changes fail.
3. Submit two concurrent predictions with the same request ID and payload. Both
   responses must identify one prediction. Reuse that request ID with changed
   probability and confirm conflict with no row change.
4. Replay the exact successful request after the event version advanced and
   confirm the original success is returned. Submit a different request with the
   stale version and confirm CAS rejection.
5. Try alternatives without a user hypothesis, prediction without a hypothesis,
   reflection without an outcome, a past due date, probability outside 0–100,
   and second prediction/outcome/reflection inserts. All must fail atomically.
6. After prediction, attempt every event snapshot field update and direct child
   update/delete. Confirm rejection and unchanged revisions. Record outcome and
   reflection and confirm monotonically appended revisions.
7. Start two AI runs for one user while one reservation is still open; only one
   is admitted. Confirm a finished run releases its in-flight reservation but
   keeps the daily admission row, and that deleting the event does not release a
   still-open reservation or erase the ledger. Seed or perform
   20 user/200 global starts in a database day and confirm the next is rejected;
   attempt six global active reservations and confirm only five.
8. Let a running lease expire, call `expire_ai_runs`, and verify terminal
   `expired`; replaying its request must not admit another model call.
9. Delete an event and verify cascaded events, predictions, outcomes,
   reflections, revisions, and runs are absent while `ai_usage_starts` remains.
10. Inspect `information_schema.role_table_grants`, policies, and function
    execute grants to verify only owner SELECT and the intended authenticated
    RPC surface are exposed.

## Remaining production gates

**Conclusion: NOT_READY.** The migration has not yet been applied or tested
against Supabase. Cross-tenant, concurrent transaction, timeout recovery, and
real DeepSeek behavior tests remain unexecuted. SLOs, RTO/RPO, retention periods,
backup deletion behavior, load/cost measurements, alert owners, incident
runbooks, kill-switch drills, semantic evaluation/independent holdout review,
canary thresholds, and rollback evidence are not defined. Global limits are
fixed initial safety limits, not load-tested capacity. The user-token finish-RPC
provenance limitation and the four request-ID contract gaps above require
product/security review.