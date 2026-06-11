# Keji Camper — M4 build plan (light social: shared logbook · tag-a-camper · invite-a-friend)

> Status: **planned, not yet built.** This records the agreed approach and the
> decisions already made in the planning conversation. In the M3 tradition, the
> next session should **critically review this plan first** (an adversarial pass
> over invariants, RLS, and the fork/consent semantics), record binding
> decisions in a companion `docs/M4-REVIEW.md`, and only then build.
>
> Source: the M3 review's deferred items (`docs/M3-REVIEW.md` D3 photos, D4
> crews) + `docs/PLAN.md` §"v1.0 — multi-user". Builds on the live M3 backend
> (accounts · sync · admin).
>
> **Revision note:** a later planning turn added **user-driven invites** — any
> member can invite a not-yet-user friend by tagging them (with an email) on a
> trip, and that friend arrives with the trip already in their logbook. This is a
> deliberate, bounded relaxation of M3's admin-only invite model; the
> "User-driven invites" section below records the openness *and* the compensating
> controls, and the adversarial review must scrutinize that trade specifically.

## The guardrail — what "light" means (do not cross)

This is a **shared cabin logbook, not a network.** The circle is no longer a
single admin-curated list — it **grows by member referral** — but it is still a
circle of named, email-gated people who each came in through a specific friend,
not an open public sign-up. A feature is still "light" only if all of these hold:

- **No open registration.** You cannot sign up unless an existing member has
  named your exact email. The DB invite gate from M3 stays; M4 only widens *who*
  may add an email to it (admin → any active member), under the controls below.
- No feed *ranking*, no follower graph, no notifications, no public web presence.
- Sharing is a **property of a thing** (a trip, a memory) — default private, opt-in.
- Others get **read-only + "save a copy to mine."** The only write anyone makes
  to another person's content is **forking it into their own** journal.
- Every invite is **attributed** (`created_by`) and **rate-limited**, and the
  admin can see the whole referral tree, revoke, and clamp invites off entirely.
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

## Three addressings, one mechanic

Every surface is **read-only-then-fork**. They differ only in *who* a thing is
addressed to:

1. **Broadcast — the cabin logbook.** A thing marked `shared = true` is visible to
   every signed-in member in a read-only **Logbook** stream (newest-first), each
   card showing the author (emoji + display_name from `profiles`, already readable)
   and a "save a copy to mine." This is the last-conversation's logbook idea.
2. **Addressed to a member — tag-a-camper.** You tag crew members who are real
   accounts on a trip/memory; each gets a pending *"Maddison added you to 'Frozen
   Ocean loop' — add it to your journal?"* On **accept** it forks into their
   journal (their trip + memories + passport stamps); on **dismiss**, nothing.
   Instead of five people re-typing the same trip, one person shares it and the
   others accept.
3. **Addressed to a not-yet-user — invite-a-friend.** The same tag, but the camper
   you add isn't a member yet, so you give an **email**. That mints an invite + an
   email-addressed share; when your friend signs in, the trip is already waiting in
   their logbook. This is the growth loop — see "User-driven invites" below. It is
   the *same mechanic* as (2), just addressed by email instead of by profile, and
   resolved to a profile on signup.

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

## User-driven invites (the growth loop)

The use case: I add a friend who *isn't a user yet* as a camper on our trip, by
email. They get an invite; when they sign in they already have that trip in their
logbook — and they can then do the same for *their* friends. This is how the app
spreads without an admin in the loop. It is more open than M3, on purpose; the job
of this section is to make it open **and** bounded.

### The flow

1. **Invite.** An active member adds a non-user camper: name + email. The client
   writes (a) an `invites` row (`email`, `created_by = me`) — the M3 auth gate —
   and (b) a `shares` row addressed `to_email = <that email>`, referencing the
   trip. The member gets a **copyable invite link/note** to send however they like
   (text, their own email, etc.). *We do not operate a mailer* (see the email
   decision below).
2. **Sign-in.** The friend opens the link and signs in with that exact email. The
   M3 invite-gate trigger finds the unused `invites` row and lets them in (no code
   change to the gate — only *who populated it* changed). `handle_new_user` creates
   their profile **and** reconciles pending shares:
   `update shares set to_profile = new.id where to_email = lower(new.email) and to_profile is null`.
3. **Arrival.** Their **logbook** query (which reads shares addressed to them)
   shows the trip immediately, read-only, attributed to the inviter — "you already
   have a copy." "Save to my trips" forks it into their own journal (and stamps
   their passport) exactly like every other surface. No row they own is created
   without their action, so **consent-by-schema still holds** for new users too.
4. **Onward.** Now a member themselves, they can invite their own non-user friends
   the same way. Invites are transitive; `created_by` makes the chain a tree.

### The compensating controls (this is the whole safety story)

The relaxation is "any active member may add an email to the gate." That is bounded by:

- **Email gate retained.** An invite for `alice@x` only ever lets `alice@x` in —
  inserting invite rows does not create accounts and grants nothing else. The most
  an abusive member can do is *list emails*, not admit arbitrary people.
- **Attribution + tree.** Every invite and share carries `created_by` / `from_owner`.
  The admin page shows the referral tree and who each member brought in.
- **Per-member rate cap.** The `invites` INSERT policy caps a member's outstanding
  *unused* invites (e.g. ≤ 10) via a `with check` subquery; the admin is exempt.
  This caps spam blast radius without a job or a cron.
- **Admin kill-switch.** A one-row `app_config(open_invites boolean)` gates the
  member-invite policy. Flip it off and invites revert to admin-only (the M3
  posture) instantly — no redeploy. The admin can also deactivate a member
  (existing `is_active()` path), which stops them inviting *and* writing.
- **No automated mail (default).** Because the member shares the link themselves,
  the app never sends bulk email — sidestepping deliverability, spoofing, and
  spam-liability concerns. Transactional email is an opt-in later (open question).
- **Privacy default: invite shares the *trip plan*, not your memories.** Inviting a
  not-yet-user exposes the referenced trip to a brand-new account; default to
  sharing the **trip** (route, sites, dates) and *not* attached memories/photos
  unless the inviter explicitly includes them. Tie the photo exposure to the
  object-storage / signed-URL move below.

### What this changes vs M3 (record honestly for the review)

- M3 invariant "signups are invite-only (admin-only invites)" becomes "signups are
  invite-only (**member-extensible**, attributed, rate-capped, admin-revocable)."
  "No open registration" is preserved; "only the admin decides who" is relaxed.
- `invites` RLS gains a member-INSERT path beside the existing admin-all policy.
- `shares` becomes addressable by `to_email` (nullable) as well as `to_profile`.
- `handle_new_user` gains the share-reconcile step.
- New `app_config` singleton for the kill-switch.

## Data model deltas (additive; migration `0002_social.sql`)

| Change | Where | Notes |
|---|---|---|
| `Camper.profileId?: string` | `types.ts` + reducer-compatible | links a local crew tag to a real account; a camper stays a plain local tag unless "claimed" from the member list. The one genuinely new client primitive. |
| `attendees?: string[]` (profileIds) | `Trip`, `Memory` `data` jsonb | co-attribution display; travels with forks. |
| `origin?: { owner: string; id: string }` | `Trip`, `Memory` `data` jsonb | fork provenance; powers de-dupe + non-double-counting. |
| `shared boolean not null default false` | `trips`, `memories` columns | powers the broadcast Logbook. |
| `shares` table | new | the addressed offers: `(id, kind 'trip'\|'memory', from_owner, ref_owner, ref_id, to_profile **nullable**, to_email **nullable**, created_at, accepted_at, dismissed_at)`. `to_email` carries pre-signup invites; `to_profile` is stamped on signup. Exactly one of the two is set at insert. |
| `invites` member-INSERT | RLS policy + per-member cap | widens M3's admin-only insert so any active member may add an email (attributed `created_by`, capped, kill-switchable). Gate trigger unchanged. |
| `app_config` table | new singleton | `(id bool pk default true, open_invites boolean not null default true)`; admin-writable; gates the member-invite policy (the kill-switch). |

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
  forge a share *from* someone else. Email-addressed shares (`to_email`, no
  `to_profile` yet) are bound to the new profile by `handle_new_user` on signup —
  not exposed to clients before that, so an unclaimed `to_email` share leaks
  nothing to anyone but its eventual owner.
- **`invites` INSERT (the relaxation):** beside the M3 `invites admin all` policy,
  add `invites member insert` — `with check (is_active() and created_by =
  auth.uid() and (is_admin() or (select open_invites from app_config)) and
  (select count(*) from invites where created_by = auth.uid() and used_at is null)
  < <CAP>)`. Admins remain exempt from cap and kill-switch. Members still cannot
  SELECT others' invites — only the admin sees the full tree.
- **`app_config`:** SELECT to authenticated (so the invite policy can read the
  flag); UPDATE to admins only.
- **No new write path on entities.** Existing `with check (owner = auth.uid())`
  stays — the consent guarantee, for new users and existing alike. Forks insert
  under the forker's own uid.
- Deactivated members: writes already gated by `is_active()`, which also blocks
  inviting; the M4 review must decide whether a deactivated member can still
  *receive* (accept) or only stops *sending* shares and invites.

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
  crew members *or add a non-user by email* (the invite path); write `shares`
  rows (`to_profile` or `to_email`) + the `invites` row for non-users, and surface
  a **copyable invite link/note** for the member to send. Optionally flip `shared`
  for the logbook.
- `handle_new_user` (M3 trigger) gains the **share-reconcile** step
  (`to_email → to_profile` by lowercased email) so an invited trip is waiting on
  first sign-in. Documented in `0002_social.sql`.
- **Admin page additions** (extend `AdminPage.tsx`): the **referral tree**
  (who invited whom, via `created_by`) and the **open-invites kill-switch**
  (`app_config.open_invites`). Per-member cap is enforced in RLS, surfaced here.
- **Passport**: a read-only overlay/badge "you + N others stamped here," computed
  from the logbook query (broadcast `shared` rows), not from co-owned data.
- `supabase/migrations/0002_social.sql` — idempotent (M3 convention), pasted by
  the principal; `docs/M4-SETUP.md` ordered steps.
- Tests: `tests/social.test.ts` (fork action shape, provenance de-dupe, attendee
  merge, "addressed-to-me vs broadcast" planning, **email→profile share reconcile**,
  **invite-cap boundary**) — pure-node, like `sync.test.ts`.

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
7. **Invite delivery: copy-link vs transactional email.** Default and
   recommendation: the member **copies an invite link/note** and sends it through
   their own channel — no app-operated mailer, least abuse/deliverability surface.
   Auto-send email is a possible fast-follow but needs an email provider and its
   own spam controls; decide whether it's in M4 at all.
8. **Invite cap `<CAP>`** — the per-member outstanding-unused-invite limit
   (starting guess ≤ 10). Pick a number; confirm admins are exempt.
9. **Open-invites default** — ship with `open_invites = true` (member invites on)
   or `false` (admin-only until you flip it)? Recommendation: `true`, since
   member-driven growth is the point — but it is a one-row change either way.
10. **Non-user share scope** — confirm the privacy default (invite shares the
    **trip plan only**, memories/photos opt-in) and how attendees are represented
    before the invitee has a profile (email placeholder → resolved on signup).
11. **Onward-invite depth** — any cap on referral-tree depth/total membership, or
    purely admin-pruned? Default: unbounded but fully visible + revocable.

## Explicitly out of scope (the line, restated)

- **Open / public registration.** Member-extensible invites are *not* open signup:
  the email gate stays, every entrant is attributed to an inviter, and the admin
  can clamp invites off. No "sign up with any email" page, ever.
- **Co-owned / collaboratively edited trips** — one canonical multi-editor row.
  The light substitute is fork-on-accept; build co-ownership only on real demand.
- **Comment threads** on memories or trips.
- **Likes/reactions as engagement.** A single one-tap acknowledgment (count only,
  no threads) is *the* boundary case — consider at most that much, and only if it
  earns its keep; never a reaction bar.
- **Feeds with ranking, notifications, public profiles, DMs, the open web.**
- **An app-operated bulk mailer / growth engine.** Invites are links a member
  sends by hand; the app does not blast email or chase un-converted invitees.
