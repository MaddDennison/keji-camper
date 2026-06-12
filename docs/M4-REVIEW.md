# M4 plan review — findings & binding build decisions

> Status: **review complete, decisions binding.** Three adversarial reviews
> (invariants/architecture, security/RLS, sync + consent/fork correctness)
> were run against `docs/M4-SOCIAL.md` before any code was written, as that
> plan required. This doc records what they found, the product calls the
> principal decided (2026-06-12), and exactly how the build deviates from the
> plan. Where this doc and M4-SOCIAL.md disagree, **this doc wins.**

## Review verdict (summary)

The plan's core is right — copy-not-co-own, consent-by-schema, social reads on
a separate ephemeral path, the reducer untouched. Fork persistence in
particular needs **no new write path at all**: an accepted fork is a
`trip/save`/`memory/save` under the recipient's own uid, so the existing
baseline diff queues it and the M3 upsert ships it. But as written the plan
had seven blockers:

1. **The invite-cap policy cannot work as sketched.** Its `with check`
   subquery counts rows of `invites` *inside an `invites` policy* — the exact
   recursive-policy trap M3's D2 fixed (`42P17`); and even where Postgres
   tolerated it, the count would run under the member's own RLS, which cannot
   see admin-created rows, so the cap would be computed against the wrong set.
2. **Email-addressed shares silently orphan for existing members.**
   `handle_new_user` only fires at signup, and `profiles` carries no email, so
   the client cannot resolve an email to a profile either. Tag an existing
   member by email and the share reconciles never.
3. **The `shared` flag's placement is load-bearing.** Inside the entity `data`
   jsonb it would ride the reducer, exports, and `import/merge` — a friend's
   imported JSON with `shared: true` would silently broadcast your copy on the
   next sync. It must be a column the sync upsert never touches.
4. **The widened SELECT leaks tombstones.** `… OR shared OR addressed-to-me`
   as sketched lets any member read a shared row the owner deleted (or an
   admin moderated away).
5. **`shares` lacks the constraints that make its policies true** — nothing
   stops re-sharing another person's content via `ref_owner`, duplicate
   offers, mixed-case `to_email`, or a recipient updating columns beyond
   accept/dismiss.
6. **Fork de-dupe as sketched still double-counts.** Passport *stamps* are
   set-based and safe, but `badges.ts` quantifies over `trips[]` and the
   journal lists duplicates unless reconcile reuses the existing **local id**;
   bundle forks must also remap `Memory.tripId`, and accept must be idempotent
   because the `accepted_at` write can fail after the local fork (offline).
7. **The kill-switch gates invite *creation*, not *use*.** Unused invites
   minted while open stay redeemable after the flip; "clamp" needs a second
   step.

All seven are fixed by the decisions below. None reopens the bound decisions
(fork-on-accept, bounded member invites, email gate, no `service_role`).

## Product calls (decided by the principal, 2026-06-12)

- **P1 — Scope: targeted + broadcast logbook ship together.** One migration,
  one mechanic (read-only-then-fork) with two addressings; no second SELECT
  -policy pass later.
- **P2 — Fork scope: the sharer chooses per share.** Default is the **trip
  plan only**; an explicit "include my memories & photos" opt-in adds the
  linked memories. The same rule applies whether the share is addressed to a
  member or to a not-yet-user email — the plan's invitee privacy default
  becomes the universal default.
- **P3 — Invite delivery: copy-a-link/note in M4.** The member sends the note
  through their own channel; the friend signs in with the existing 6-digit
  code + "I have a code" path (Supabase + the already-wired Resend SMTP send
  that code — the only email the system ever sends). **Transactional
  auto-send email is an approved fast-follow**, not in M4.
- **P4 — Cap 10 · invites ON.** Per-member cap of 10 outstanding *unused*
  invites, admins exempt; `app_config.open_invites` defaults `true` at launch.

## Binding decisions

### D1 — Invite gating is a SECURITY DEFINER function (fixes blocker 1)

- `can_create_invite()` — `SECURITY DEFINER STABLE SET search_path = public`,
  the `is_admin()`/`is_active()` house pattern — returns true when the caller
  is an admin, or is active **and** `app_config.open_invites` is set **and**
  their count of unused invites (`created_by = auth.uid() and used_at is
  null`) is below **10** (P4; the cap is a constant inside the function — one
  place to change).
- `invites` policies beside the untouched M3 `invites admin all`:
  member INSERT `with check (created_by = auth.uid() and
  public.can_create_invite())`; member SELECT own (`created_by = auth.uid()`)
  so the UI can show sent invites and the cap meter; member DELETE own
  *unused* (revoke frees a cap slot). **No member UPDATE.** The signup gate
  trigger is byte-identical to M3.
- Accepted: two concurrent inserts can overshoot the cap by one — fine at
  family scale, recorded.

### D2 — Share reconcile is two-sided (fixes blocker 2)

- A `BEFORE INSERT` trigger on `shares` (SECURITY DEFINER) resolves
  `to_email` against `auth.users` by lowercased email: if that email is
  already a member, the trigger sets `to_profile` and clears `to_email` — so
  tagging an existing member by email just works.
- `handle_new_user` gains the signup-time step (after the profile insert):
  `update shares set to_profile = new.id, to_email = null where
  lower(to_email) = lower(new.email) and to_profile is null`.
- Clearing `to_email` on bind keeps the table constraint a plain
  `num_nonnulls(to_profile, to_email) = 1` at rest, and emails don't linger on
  share rows (the referral tree lives on `invites`).
- Accepted: a sender who watches their sent share resolve learns "this email
  is already a member." Tolerable in a named, email-gated circle; recorded.

### D3 — `shared` is a column, toggled only by the social adapter (fixes blocker 3)

- `alter table … add column if not exists shared boolean not null default
  false` on `trips` and `memories`. **Never** in `data` jsonb — the reducer,
  exports, and `import/merge` must stay unable to express "broadcast this."
- The toggle is a dedicated `update({ shared }).eq(owner/id)` in the social
  adapter; the column UPDATE grant gains `shared`. The sync upsert is
  unaffected: PostgREST's `ON CONFLICT … DO UPDATE SET` covers payload columns
  only (`id`, `data`), so syncing an edit never resets the flag.
- The Logbook reads `shared = true and deleted_at is null` rows via a
  separate ephemeral query (the AdminPage/NoticeBanner pattern), with
  `order by updated_at desc` + a `limit` so photo-bearing payloads stay
  bounded.

### D4 — The widened SELECT excludes tombstones and dismissed offers (fixes blocker 4)

- `trips`/`memories` SELECT becomes
  `owner = auth.uid() or public.is_admin() or (deleted_at is null and (shared
  or public.has_share_to_me(<kind>, owner, id)))`.
  Owner and admin keep tombstone visibility (sync and moderation need it);
  the social branches see live rows only.
- `has_share_to_me(kind, ref_owner, ref_id)` is SECURITY DEFINER (house
  pattern; sidesteps policy→policy RLS interplay entirely): exists a `shares`
  row for that ref with `to_profile = auth.uid() and dismissed_at is null`.
  Accepted-but-not-dismissed offers stay readable (the inbox card remains
  renderable until dismissed).
- The sync pull is untouched: it still filters `.eq('owner', uid)` and
  `planInbound`'s `expectedOwner` guard drops any foreign row as the second
  line of defense. Social rows reach the Logbook/inbox queries only.

### D5 — The `shares` contract (fixes blocker 5; deviates from the plan's sketch)

Columns: `id uuid pk default gen_random_uuid()`, `kind text check (kind in
('trip','memory'))`, `from_owner uuid not null default auth.uid()`,
`ref_id text not null`, `to_profile uuid null references profiles(id)`,
`to_email text null`, `bundle_id uuid null`, `created_at`, `accepted_at`,
`dismissed_at`.

- **`ref_owner` is dropped** — `from_owner` *is* the ref owner. You can only
  offer what you own, by shape, not just by policy (no re-sharing someone
  else's content).
- Constraints: `num_nonnulls(to_profile, to_email) = 1`; `to_profile <>
  from_owner` (no self-shares); `to_email` lowercased/trimmed by the D2
  trigger. Partial unique indexes on `(kind, from_owner, ref_id, to_profile)`
  and `(kind, from_owner, ref_id, to_email)` stop duplicate offers (inbox
  spam) by construction.
- Policies: INSERT `from_owner = auth.uid() and public.is_active()` and the
  referenced row exists, is the caller's, and has `deleted_at is null`
  (cannot offer a tombstone). Recipient SELECT/UPDATE on `to_profile =
  auth.uid()`, with the UPDATE **column grant limited to `accepted_at,
  dismissed_at`**. Sender SELECT own sent rows and DELETE own (revoke, or
  re-offer after a dismissal — delete-then-reinsert is the re-share path
  through the unique index). Admin SELECT all. Recipients never DELETE;
  dismissal is `dismissed_at`. Unbound `to_email` rows are visible only to
  their sender and the admin.
- **Bundles (P2):** "include my memories & photos" mints one `kind='memory'`
  share per linked memory in the same batch, all carrying one client-generated
  `bundle_id`. Policies stay uniform — no jsonb parsing in RLS — and the inbox
  groups by `bundle_id`. A share is a **snapshot offer**: memories added to
  the trip later need a re-share. No rate cap on `shares` itself: the dedup
  indexes bound per-recipient volume per entity, and deactivation is the
  backstop (recorded as an accepted risk).

### D6 — Fork & provenance semantics (fixes blocker 6)

- `src/lib/social.ts` is a **pure core** (no React/supabase/browser globals,
  M3 `sync.ts` style). Fork planning takes the remote rows, my current
  `AppData`, my profile id, and an injected id generator, and returns reducer
  actions (`trip/save`/`memory/save`) — the reducer and `import/merge` are
  never touched.
- `origin: { owner, id }` is stamped into the forked entity's data. The
  de-dupe resolver matches by `origin` and **reuses the existing local id**
  (in-place update) — never a second copy, so trip-quantified badges and the
  journal stay honest. Bundle forks **remap `Memory.tripId`** to the local
  trip id, whether that trip was freshly forked or reconciled.
- `attendees` on the fork = source attendees ∪ sharer ∪ recipient (profile
  ids), merged by the pure helper.
- **Accept order: fork locally first, then set `accepted_at`.** The local
  dispatch works offline; if the `accepted_at` write fails, a later re-accept
  reconciles by provenance to the same local id — accept is idempotent by
  construction. A re-accept after the sharer edits refreshes the copy in
  place: an explicit click is consent to refresh; the build never
  auto-refreshes a fork.
- **Documented limitation:** anonymous `#/view/` link forks (`share.ts`)
  carry no owner, so they cannot carry `origin`; a manual link-fork plus a
  later tagged share of the same trip yields two copies. Not worth contorting
  the accountless wire format. Passport stamps still don't double (set
  semantics).

### D7 — Kill-switch + the clamp procedure (fixes blocker 7)

- `app_config`: `(id boolean primary key default true check (id),
  open_invites boolean not null default true)` — P4 — seeded by the migration
  with `on conflict do nothing`. SELECT to authenticated (the UI may tell
  members invites are off); UPDATE to admins with a column grant on
  `open_invites` only; no client INSERT/DELETE.
- Flipping `open_invites` off stops new member invites instantly but **does
  not revoke unused invites already minted**. The full clamp is flip **and**
  prune unused invites; the AdminPage surfaces both actions side by side, and
  `docs/M4-SETUP.md` documents the two-step.

### D8 — Remaining M4-SOCIAL.md open questions, resolved

- **De-dupe scope (Q3):** covered by D6; the link-fork gap is the accepted
  exception.
- **Deactivated members (Q4): read/receive-only.** `is_active()` gates
  `shares` and `invites` INSERT (they stop sending), and their accepts fail at
  the entity-sync layer anyway (M3 write policies already require active).
  Their previously shared rows stay visible unless the admin tombstones them —
  deactivation is about the person, soft-delete about the content.
- **Inbox delivery (Q5): poll-on-focus**, consistent with M3 sync. No
  realtime.
- **Photo storage (Q6): the object-storage move (M3-REVIEW D3) stays
  deferred.** Forks copy data-URL photos exactly as sneakernet import always
  has. The conscious privacy call, recorded: opting a memory into a share or
  the logbook exposes its photos to the recipients / the whole circle, and
  every accepted fork holds a full copy. P2's trip-plan-only default keeps
  photos from traveling unless explicitly included. Revisit object storage
  when circle size or photo weight makes logbook pulls heavy (the D3 limit
  bounds this meanwhile).
- **Onward-invite depth (Q11): unbounded**, fully visible via the
  `created_by` referral tree on the AdminPage, admin-pruned.
- **Invite-note copy:** must not hardcode the code length ("enter the code we
  email you", not "the 6-digit code") — the OTP length is dashboard-
  configurable (M3 go-live gotcha).

## Where the build deviates from M4-SOCIAL.md (quick index)

- Invite cap enforced by `can_create_invite()` SECURITY DEFINER, not an
  in-policy subquery (D1).
- Share reconcile also happens at INSERT time for existing members, and
  binding clears `to_email` (D2).
- Non-owner SELECT branches require `deleted_at is null`; addressed-to-me is
  the `has_share_to_me()` definer function (D4).
- `shares` drops `ref_owner`; adds `bundle_id`, the exactly-one-recipient
  check, no-self-share, dedup unique indexes, recipient column grants,
  sender delete-to-revoke (D5).
- "Include memories" is child share rows in a bundle, not a flag interpreted
  by RLS (D5/P2).
- Transactional invite email is explicitly out of M4 (approved fast-follow,
  P3).

## Interface contracts (builders code against these)

- `supabase/migrations/0002_social.sql` — idempotent like 0001 (`if not
  exists` / `create or replace` / drop-then-create policies and triggers;
  grants re-runnable; `app_config` seeded `on conflict do nothing`). Pasted by
  the principal; ordered steps in `docs/M4-SETUP.md`. Touches: `shared`
  columns + grants, `shares`, `app_config`, `can_create_invite()`,
  `has_share_to_me()`, the shares reconcile trigger, the new `invites`
  policies, the widened entity SELECT policies, and `handle_new_user`
  (re-`create or replace`d with the reconcile step — the invite-gate trigger
  is untouched).
- `src/types.ts` — `Camper.profileId?`, `Trip`/`Memory`
  `attendees?: string[]` and `origin?: { owner: string; id: string }`. All
  optional; reducer, exports, and logged-out behavior unchanged.
- `src/lib/social.ts` — **pure**: fork planning + provenance de-dupe resolver
  (id-reuse, `tripId` remap, attendee merge), addressed-vs-broadcast
  partitioning of fetched rows, share-batch planning (share rows + invite
  rows for emails + the bundle), and the cap-boundary helper for the UI
  meter. Unit-tested in `tests/social.test.ts` (pure node, like
  `sync.test.ts`): fork action shape, provenance de-dupe, attendee merge,
  addressed-vs-broadcast, email→profile reconcile planning, invite-cap
  boundary.
- `src/lib/useLogbook.tsx` (thin adapter) — ephemeral fetch of logbook rows,
  my inbox (pending shares), and my sent shares/invites; poll-on-focus;
  gated on `supabase && session`; never touches the reducer's persisted data
  or the sync baseline/queue keys.
- `src/pages/LogbookPage.tsx` + `#/logbook` — read-only stream, "save a copy"
  per card; logged out it renders a gate card exactly like `#/admin` does
  today. Inbox pill in `AuthBar` with Accept / Dismiss. "Share with campers"
  control on trips/memories (members, or add-by-email → invite + copyable
  note). AdminPage gains the referral tree, the `open_invites` switch, and
  unused-invite pruning.
- All 78 existing tests stay green and are not weakened to pass.
