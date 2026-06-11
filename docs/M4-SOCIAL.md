# Keji Camper — M4 build plan (light social: shared logbook · tag-a-camper)

> Status: **planned, not yet built.** This records the agreed approach and the
> decisions already made in the planning conversation. In the M3 tradition, the
> next session should **critically review this plan first** (an adversarial pass
> over invariants, RLS, and the fork/consent semantics), record binding
> decisions in a companion `docs/M4-REVIEW.md`, and only then build.
>
> Source: the M3 review's deferred items (`docs/M3-REVIEW.md` D3 photos, D4
> crews) + `docs/PLAN.md` §"v1.0 — multi-user". Builds on the live M3 backend
> (accounts · sync · admin).

## The guardrail — what "light" means (do not cross)

This is a **shared cabin logbook, not a network.** One trusted, invite-gated
circle. A feature is still "light" only if all of these hold:

- No feed *ranking*, no follower graph, no notifications, no public web presence.
- Sharing is a **property of a thing** (a trip, a memory) — default private, opt-in.
- Others get **read-only + "save a copy to mine."** The only write anyone makes
  to another person's content is **forking it into their own** journal.
- If a feature needs a moderation queue or a "mark as read," it has crossed the
  line and belongs to a different product.

Anything past this — co-editing, comments threads, likes-as-engagement — is
explicitly out of scope (see the last section).

## Hard invariants (inherited from M3 — do not violate)

- **The reducer in `src/lib/store.tsx` is the single write path.** A fork is just
  `trip/save` / `memory/save` with a fresh id and `owner = self`. The reducer is
  NOT restructured. (ARCHITECTURE.md §6)
- **The app stays 100% functional logged-out**, byte-identical to today. Social
  features only *add* surfaces; they never gate the local journal.
- **Sync stays owner-scoped.** The M3 go-live fix made `pull()` filter
  `.eq('owner', uid)` and gave `planInbound` an `expectedOwner` guard precisely
  so foreign rows never enter local `AppData`/baseline. **Social reads must NOT
  go through the sync pull.** Shared/other-people's rows are read by a *separate,
  ephemeral query* (the same pattern `AdminPage` and `NoticeBanner` already use)
  and rendered read-only; they never touch the reducer or the sync baseline.
- **`service_role` never enters the repo, chat, or any artifact.** Anon key + RLS
  only, as in M3.
- Existing tests (64 at M3 go-live) stay green and are not weakened to pass.

## The core decision (BINDING): a shared trip is a *copy*, not a co-owned document

For a backcountry **journal** we fork, we do not co-own. Reasons, recorded so a
later session doesn't relitigate:

- **The trip already happened.** We log a past experience, not a live plan.
  Divergence after a fork (someone later fixes a date) is acceptable — each
  person's journal is legitimately their own.
- **The passport works for free.** Stamps derive from *your own* trips/memories,
  so a forked trip stamps the recipient's passport with no special logic.
  Co-ownership would require deriving the passport across *other owners'* rows —
  i.e. pulling foreign rows into local state, which breaks the owner-scoped-sync
  invariant above. Copy keeps that invariant intact.
- **It reuses what exists.** `SharedTripPage` already does read-only + "Save a
  copy to my trips"; `share.ts` already encodes/decodes a trip. This milestone is
  a *targeted, in-app, account-aware* version of that same fork-on-accept mechanic.

True co-ownership (one canonical row, many editors) is the heavy path —
attendee join tables, "owner OR attendee" RLS, edit-permission and
owner-deletion semantics. It stays in the back pocket; build it only if people
genuinely ask to **edit each other's** trips.

## Two surfaces, one mechanic

Both surfaces are **read-only-then-fork**. They differ only in addressing:

1. **Passive — the cabin logbook (broadcast).** A thing marked `shared = true` is
   visible to every signed-in member in a read-only **Logbook** stream
   (newest-first), each card showing the author (emoji + display_name from
   `profiles`, already readable) and a "save a copy to mine." This is the
   last-conversation's logbook idea.
2. **Active — tag-a-camper (addressed).** The heart of this milestone. You tag
   crew members who are real accounts on a trip/memory; each gets a pending
   *"Maddison added you to 'Frozen Ocean loop' — add it to your journal?"* On
   **accept** it forks into their journal (their trip + memories + passport
   stamps); on **dismiss**, nothing. Instead of five people re-typing the same
   trip, one person shares it and the others accept.

### Consent is enforced by the schema, not just the UI

Forking is **pull/accept, never push.** Critically, this is already guaranteed by
the M3 RLS: every entity table has `with check (owner = auth.uid())`, so **no one
can insert a row owned by someone else** — unilateral injection into another
person's journal is impossible by construction. A "share" is therefore only an
*offer the recipient can read*; the write that lands it in their journal is their
own accepted fork, under their own uid. The doc must keep it that way.

### Co-attribution travels with the copies

Each forked trip/memory keeps an `attendees: profileId[]` (in the entity `data`
jsonb, so it rides through the reducer with no row-shape change), so *everyone's*
copy still shows "🛶 Maddison · 🦫 Sam" — the warmth of "who I was with" without
shared ownership. `Memory.authorId` already gestures at this; we generalize it.

### Provenance prevents duplicate forks and double stamps

A forked entity carries a provenance stamp — `origin: { owner, id }` (in `data`).
On a re-share or re-accept, the client reconciles by provenance (update the
existing copy in place) rather than creating a second trip — so the passport never
double-counts a single real night. This must be in the build, not an afterthought.

## Data model deltas (additive; migration `0002_social.sql`)

| Change | Where | Notes |
|---|---|---|
| `Camper.profileId?: string` | `types.ts` + reducer-compatible | links a local crew tag to a real account; a camper stays a plain local tag unless "claimed" from the member list. The one genuinely new client primitive. |
| `attendees?: string[]` (profileIds) | `Trip`, `Memory` `data` jsonb | co-attribution display; travels with forks. |
| `origin?: { owner: string; id: string }` | `Trip`, `Memory` `data` jsonb | fork provenance; powers de-dupe + non-double-counting. |
| `shared boolean not null default false` | `trips`, `memories` columns | powers the broadcast Logbook. |
| `shares` table | new | the addressed offers: `(id, kind 'trip'\|'memory', from_owner, ref_owner, ref_id, to_profile, created_at, accepted_at, dismissed_at)`. |

### RLS sketch (to be hardened in the M4 review, M3-style)

- **`trips`/`memories` SELECT** widens to
  `owner = auth.uid() OR is_admin() OR shared OR <addressed-to-me>`, where
  *addressed-to-me* = "there is a non-dismissed `shares` row with `ref_owner` /
  `ref_id` pointing at this row and `to_profile = auth.uid()`." This keeps
  **whole-cabin broadcast (`shared`)** distinct from **targeted offer (`shares`)**
  — you can share with three people without dumping it in everyone's logbook.
  The owner-scoped sync `pull` is *unaffected*: it still filters `.eq('owner', …)`,
  so the widened SELECT only ever feeds the separate Logbook/inbox queries.
- **`shares`**: a member may INSERT a share only for a row they own
  (`from_owner = auth.uid()` and the ref is theirs); the recipient may SELECT and
  UPDATE (accept/dismiss) only rows where `to_profile = auth.uid()`. No one can
  forge a share *from* someone else.
- **No new write path on entities.** Existing `with check (owner = auth.uid())`
  stays — the consent guarantee. Forks insert under the forker's own uid.
- Deactivated members: writes already gated by `is_active()`; the M4 review must
  decide whether a deactivated member can still *receive* (accept) or only stops
  *sending* shares.

## Code changes (all additive; reducer never edited)

- `src/types.ts` — `Camper.profileId`, `Trip/Memory.attendees`, `…origin`.
- `src/lib/social.ts` (**pure core**, M3 sync-style) — fork/provenance helpers:
  given a remote shared row + my uid, produce the `trip/save`/`memory/save`
  action with a fresh id, `owner` implicit, `origin` stamped, attendees merged;
  and a de-dupe resolver that finds an existing copy by `origin`. Pure functions,
  unit-tested in node like `sync.ts`.
- `src/lib/logbook.ts` + a thin adapter — the **separate ephemeral read path** for
  shared rows and my pending shares; gated on session; never touches the sync
  baseline or the reducer's persisted data.
- `src/pages/LogbookPage.tsx` + `#/logbook` route — read-only broadcast stream;
  "save a copy" per card.
- An **inbox** surface (pending `shares` to me) — small, in `AuthBar` or its own
  pill — with Accept / Dismiss.
- A **"share with campers"** control on trips/memories — pick claimed-account
  crew members, write `shares` rows (+ optionally flip `shared` for the logbook).
- **Passport**: a read-only overlay/badge "you + N others stamped here," computed
  from the logbook query (broadcast `shared` rows), not from co-owned data.
- `supabase/migrations/0002_social.sql` — idempotent (M3 convention), pasted by
  the principal; `docs/M4-SETUP.md` ordered steps.
- Tests: `tests/social.test.ts` (fork action shape, provenance de-dupe, attendee
  merge, "addressed-to-me vs broadcast" planning) — pure-node, like `sync.test.ts`.

## Bundle the M4 photo move (M3-REVIEW D3)

Forking copies a memory's photos. Today those are data-URLs inside `data` jsonb;
copying them into every attendee's row is wasteful and means "shared" = "the whole
cabin holds a full copy of the photos." This is the natural moment to do the
deferred **object-storage swap**: photos move to a bucket with signed URLs, shared
memories reference the object rather than re-embedding it. ARCHITECTURE §6 already
anticipated this ("that is *why* the app uses data-URLs"). Photo privacy inside a
trusted invited circle is acceptable, but it is a **conscious choice** to record.

## Open questions for the M4 review session

1. **Ship targeted-only first?** The addressed tag-a-camper flow is the headline;
   the broadcast logbook could be a fast-follow. Decide whether `shared` ships in
   `0002` or waits.
2. **Accept trip-only or trip + its memories?** A shared trip may have linked
   memories (`Memory.tripId`); does Accept fork just the trip, or the bundle?
3. **De-dupe scope.** Provenance reconciles re-accepts; confirm it also stops a
   manual fork + a later tagged share from double-stamping the passport.
4. **Deactivated members** — receive-only, or fully excluded from shares?
5. **Inbox delivery** — poll-on-focus (consistent with M3 sync) vs realtime.
   Default: poll-on-focus.
6. **Photo storage** — confirm the object-storage swap rides in M4 vs a separate
   pass, given the shared-photo argument above.

## Explicitly out of scope (the line, restated)

- **Co-owned / collaboratively edited trips** — one canonical multi-editor row.
  The light substitute is fork-on-accept; build co-ownership only on real demand.
- **Comment threads** on memories or trips.
- **Likes/reactions as engagement.** A single one-tap acknowledgment (count only,
  no threads) is *the* boundary case — consider at most that much, and only if it
  earns its keep; never a reaction bar.
- **Feeds with ranking, notifications, public profiles, DMs, the open web.**
