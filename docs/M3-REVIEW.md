# M3 plan review — findings & binding build decisions

> Status: **review complete, decisions binding.** Three adversarial reviews
> (invariants/architecture, security/RLS, sync correctness) were run against
> `docs/M3-PLAN.md` before any code was written, as that plan required.
> This doc records what they found and exactly how the build deviates from
> the original plan. Where this doc and M3-PLAN.md disagree, **this doc wins**.

## Review verdict (summary)

The plan's architecture instincts are right — additive code only, reducer
untouched, anon-key-only with RLS as the boundary, poll-on-focus, migration
hand-pasted by the principal. But as written it had four classes of blocker:

1. **Echo loop.** Inbound `import/merge` always produces new object references,
   so a render-snapshot diff re-uploads everything just received; the server
   `updated_at` trigger turns that into cross-device ping-pong.
2. **Deletes cannot propagate.** `import/merge` only upserts. Local deletes
   resurrect on the next poll; remote/admin tombstones never reach clients.
3. **Schema footguns.** Self-writable `role` column (one UPDATE away from
   admin), recursive admin RLS (`42P17`), no DB-side invite gate (magic links
   auto-create `auth.users` for anyone with the public anon key), soft-delete
   incoherent with admin select-only grants, bare client-generated `id` as PK
   (cross-user collisions), deactivation as specced needs service_role.
4. **Photos self-contradictory.** Data-URLs already travel inside the
   `memories.data` jsonb, so the bucket is either dead weight or forces the
   entity-type mutation the invariants forbid.

## Binding decisions

### D1 — Sync semantics (fixes blockers 1 & 2)

- **Baseline map, not render diff.** Sync keeps a per-entity baseline
  (`"{table}:{id}" → serialized JSON`) in its own localStorage key. Outbound
  dirty = content differs from baseline. Inbound apply advances the baseline
  *before* dispatching, so an inbound apply produces **zero outbound ops**
  (unit-tested).
- **Deletes are tombstones.** A local delete becomes `UPDATE … SET deleted_at
  = now()` remotely (never SQL DELETE). Inbound rows with `deleted_at` set
  dispatch the existing `trip/delete` / `memory/delete` / `camper/delete`
  actions — existing action vocabulary, reducer untouched.
- **Queue is a coalescing per-entity map**, not a log: the newest local op for
  an id replaces the pending one (save-then-delete ⇒ tombstone;
  delete-then-save ⇒ upsert). Entries removed individually on confirmed success.
- **Flush before poll, always.** On focus / online / sign-in: flush queue,
  then pull. Inbound skips any id with a pending queued op (dirty set), so
  offline edits are never clobbered by a pull.
- **Honest naming:** conflict resolution is **last-upload-wins per entity**
  (server `updated_at` is arrival time; no precondition). Acceptable for a
  small shared journal; documented rather than mislabeled "LWW".
- **`reset` safety:** if the baseline is non-empty and the new snapshot has
  zero entities, the differ emits **no ops** and signals reset; sync clears
  its baseline/queue instead of tombstoning the cloud journal (unit-tested).
- **Sync state lives outside AppData** under separate localStorage keys
  (`keji-camper/sync-baseline/v1`, `keji-camper/sync-queue/v1`). The
  `keji-camper/v1` document and exports stay byte-identical.
- **Pure-core / adapter split** so sync is testable in pure-node vitest:
  `src/lib/sync.ts` exports only pure functions (no React, no supabase, no
  browser globals); `src/lib/useSync.tsx` is the thin adapter.

### D2 — Schema hardening (fixes blocker 3)

- **`is_admin()`** is a `SECURITY DEFINER STABLE SET search_path = public`
  function; **all** admin policies call it (no profiles-queries-profiles
  recursion). Same pattern for `is_active()`.
- **Role is not client-writable.** Column-level grants: authenticated may
  UPDATE only `display_name, emoji, bio` on profiles. The signup trigger
  hardcodes `role = 'member'` (admin seed email excepted) and never copies
  privileged fields from user metadata.
- **Invite gate is a DB trigger**, not a client check: `BEFORE INSERT ON
  auth.users` raises unless the email is the admin seed or matches an unused
  `invites` row; stamps `used_by`/`used_at` atomically. Rejected signups
  surface as a generic 500 — documented in M3-SETUP.md.
- **Composite PK `(owner, id)`** on trips/memories/campers, with
  `owner uuid NOT NULL DEFAULT auth.uid()`; policies written as explicit
  `USING (owner = auth.uid()) WITH CHECK (owner = auth.uid())`. Client uid()
  collisions across users become impossible by construction.
- **Soft delete:** owners may update `data` and `deleted_at` (column grants);
  our client never sends `deleted_at` on upserts, only on explicit delete ops.
  Admin moderation goes through `SECURITY DEFINER` RPCs
  (`admin_set_deleted`, `admin_set_deactivated`) that touch only those
  columns — **no generic admin UPDATE policy**. Owner SELECT includes
  tombstoned rows so tombstones can propagate.
- **Deactivation = `profiles.deactivated_at`** set via RPC; write policies on
  trips/memories/campers additionally require the caller is active. True
  auth-level bans are a manual dashboard step (documented), never service_role.
- **Invite creation = inserting an `invites` row** (admin RLS allows it) and
  sharing the app URL; the email match in the trigger is the actual gate.
  No `auth.admin.*` APIs anywhere.
- **Notices are session-gated** (`SELECT` to authenticated). The home banner
  renders only when signed in — preserving the logged-out invariant. Admin
  writes via `is_admin()` policies.
- **profiles drops `paddle_kmh`/`hike_kmh`** (settings stay local-only; no
  second source of truth). Kept: id, display_name, emoji, role, bio,
  deactivated_at, joined_at.

### D3 — Photos: bucket deferred to M4 (fixes blocker 4)

Photo data-URLs are already small (≤1024px, q0.72 JPEG) and travel inside
`memories.data` jsonb. The `photos` storage bucket is **descoped from M3**:
shipping it would either store every photo twice with nothing reading the
bucket copy, or force bucket paths into `Memory.photos` and break logged-out
rendering. The swap to object storage is mechanical later (that is *why* the
app uses data-URLs — ARCHITECTURE §6) and becomes M4 work alongside the
sharing story it actually enables.

### D4 — Open questions from M3-PLAN.md, resolved

- **Realtime vs poll-on-focus:** poll-on-focus (plus `online` event). Realtime
  stays an optional enhancement.
- **`campers` scope:** owner-only; crews deferred. Campers are **excluded from
  admin content counts** (owner-only RLS is correct; do not widen it for a count).
- **Repo About website field:** set via `gh` by the agent.
- **Anon key printed in M3-PLAN.md:** accepted explicitly — the key is
  publishable by design; security comes from RLS. Doc copies are informational.

## Interface contracts (builders code against these)

- `src/lib/supabase.ts` — exports `supabase: SupabaseClient | null`, built
  from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`;
  `null` when either is unset. Also exports `SITE_URL = 'https://kejicamper.ca'`.
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth(): { session, profile,
  signIn(email), signOut() }`. `profile` is the caller's `profiles` row (or
  null). `signIn` uses `signInWithOtp` with `emailRedirectTo: SITE_URL`.
  Renders children unchanged; everything no-ops when `supabase` is null.
- `src/lib/sync.ts` — **pure**. `SyncOp { kind: 'upsert'|'delete'; table:
  'trips'|'memories'|'campers'; id; data? }`; `diffSnapshots(data, baseline)
  → { ops, reset }`; `coalesceOp(queue, op) → queue`; `planInbound(data,
  remoteRows, dirtyKeys) → { actions, baselineUpdates }`; serialization
  helpers. Zero imports of React/supabase/browser globals.
- `src/lib/useSync.tsx` — adapter hook + `<SyncMount/>` component; owns the
  localStorage keys above; flush-before-poll on focus/online/sign-in; gated
  on `session && supabase`.
- `src/components/AuthBar.tsx` — magic-link sign-in UI, session display,
  sign-out, first-login "upload my local journal" action, and the
  session-gated `<NoticeBanner/>`. Renders **nothing** when `supabase` is null.
- `src/pages/AdminPage.tsx` — `#/admin` route; UI gated on
  `profile.role === 'admin'` (RLS is the real boundary): member list with
  trip/memory counts, invite creation, deactivate/reactivate, cross-user
  content view, soft-delete/restore, notice editor.
- `supabase/migrations/0001_init.sql` — single reviewed file implementing D2;
  pasted into the SQL editor by the principal (steps in `docs/M3-SETUP.md`).
