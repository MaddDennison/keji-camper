# Keji Camper — M3 build plan (accounts · sync · admin)

> Status: **planned, not yet built.** This is the agreed approach for v0.2 Theme D
> (F8 accounts, F9 sync, F10 admin), drafted in a planning session and paused for
> review before any code or schema was written. The next session should **critically
> review this plan first**, surface concerns, then build.
>
> Source spec: `docs/PLAN-v0.2.md` (Theme D) + `docs/ARCHITECTURE.md` §6.
> M1/M2 are merged to `main`; v0.2 is fully client-side and working.

## Hard invariants (do not violate)

- **The reducer in `src/lib/store.tsx` is the single write path.** Sync *mirrors* its
  actions; it must NOT be restructured. (ARCHITECTURE.md §6)
- **The app stays 100% functional logged-out** — current localStorage behaviour must be
  byte-identical. Login only *adds* sync + sharing.
- **`service_role` secret key never enters the repo, chat, or any artifact.** Only the
  publishable (anon) key — safe in client code, protected by RLS — is used.
- `import/merge` is already idempotent by id → it is the inbound apply path for remote.
- Existing 37 tests must stay green and must not be weakened or deleted to pass.

## Supplied config (lives in `.env.local`, gitignored)

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://tpmeokrahngjrakwnjio.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_XPcGTFbY64rkXHZPyuRYuw_4OevrxIt` (publishable — safe client-side) |
| Auth Site URL (manual, in Supabase dashboard) | `https://kejicamper.ca` |
| Admin seed email | `maddisondennison85@gmail.com` |

## Data model — one Postgres table per reducer entity

Maps 1:1 onto existing reducer actions (`trip/save` → upsert `trips` row, etc.), so the
reducer is untouched and we get last-write-wins **per entity** for free.

| Table | Shape | RLS |
|---|---|---|
| `profiles` | id (auth uid), display_name, emoji, role (`admin`\|`member`), bio, paddle_kmh, hike_kmh, joined_at | self read/write · authenticated read-all |
| `trips` | id, owner, `data jsonb`, updated_at, deleted_at | owner read/write · admin select-all |
| `memories` | id, owner, `data jsonb`, updated_at, deleted_at | owner read/write · admin select-all |
| `campers` | id, owner, `data jsonb`, updated_at, deleted_at | owner read/write |
| `invites` | code, email, created_by, used_by, created_at | admin only |
| `notices` | id, body, active, created_at | authenticated read · admin write |
| storage bucket `photos` | path = `{owner}/…` | owner read/write by path prefix |

- Triggers: auto-create a `profiles` row on `auth.users` insert; maintain `updated_at`.
- Seed: the admin email becomes the **sole** `admin`.
- Signups are **invite-gated** (no open registration).
- `settings` stays **local-only** (per-device prefs — not worth syncing).

Migration is a single reviewed file: `supabase/migrations/0001_init.sql`, which **the
principal pastes into the Supabase SQL editor themselves**.

## Code changes (all additive; `store.tsx` reducer never edited)

- `src/lib/supabase.ts` — client singleton from env; returns `null` when env unset.
- `src/lib/auth.tsx` — `AuthProvider` exposing `{ session, signIn, signOut }`; no-op
  wrapper when logged out so the local render path is unchanged.
- `src/lib/sync.ts` + a `useSync` hook — subscribes to store `data`, snapshot-diffs to
  detect changed entities, upserts them to Supabase; **offline queue** in localStorage
  flushes on `online`; inbound realtime (fallback: poll-on-focus) →
  `dispatch({ type: 'import/merge' })`; photos upload to the `photos` bucket on memory
  save while the local data-URL is kept as offline cache. All sync gated on a session.
- `src/components/AuthBar.tsx` — sign-in entry + first-login one-time
  "upload my local journal" action (push every local entity once).
- `src/pages/AdminPage.tsx` + `#/admin` route in `App.tsx` — role-gated UX (RLS is the
  real boundary): member list w/ content counts, invite-link creation, member
  deactivation, cross-user content view, soft-delete (`deleted_at` tombstone) + restore,
  broadcast notice editor. Active notice renders as a banner on the app home.
- `.env.example` (committed), `.env.local` (gitignored), README env steps + Pages-URL →
  `https://kejicamper.ca` swap, ARCHITECTURE.md runtime-deps note updated (adding
  `@supabase/supabase-js` breaks "exactly three deps" — document, don't break silently).
- `docs/M3-SETUP.md` — ordered manual steps for the principal.
- Tests: `tests/sync.test.ts` (offline queue, LWW), `tests/auth-share.test.ts`
  (auth-state / share interactions); all 37 existing tests stay green.

## Branch & delivery

- Branch `claude/m3-accounts-sync-admin`. **Empty-commit push first** to confirm write
  access — report immediately if it 403s.
- Run `/code-review` on new TS, verify logged-out parity, then open a PR to `main`.

## Manual steps for the principal (the only non-code work — full version in docs/M3-SETUP.md)

1. Paste `supabase/migrations/0001_init.sql` into the Supabase SQL editor and run it.
2. Auth → Providers: enable **Email** magic links.
3. Auth → URL Configuration: set **Site URL = `https://kejicamper.ca`**.
4. (Optional / agent-assisted) set the repo About website field to `https://kejicamper.ca`.

## ISC checklist (verification criteria — full set in the paused PRD)

Config: supabase-js dep · `.env.example` (URL+anon) · `.env.local` real values · gitignore
`.env*.local` · README env steps · README domain swap · About website field · `supabase.ts`
singleton + null-when-unset · **no service_role anywhere** · ARCHITECTURE dep-note updated.

Schema: `0001_init.sql` exists · profiles/trips/memories/campers/invites/notices tables ·
role check · RLS on every table · profiles self-rw + read-all · trips owner-rw + admin
select-all · memories owner-rw + admin select-all · invites admin-only · notices read /
admin-write · profile-on-signup trigger · updated_at trigger · admin seed · invite-gated
signups · photos bucket owner-scoped.

Auth: AuthProvider/session · magic-link UI · redirectTo = site URL · sign-out reverts to
local-only · **logged-out path unchanged** · first-login upload-local-journal · login is
additive.

Sync: mirrors reducer actions · reducer not restructured · offline queue buffers ·
flush on reconnect · LWW on updated_at · inbound via import/merge · photo→bucket ·
data-URL cache kept · **no sync when logged out**.

Admin: `#/admin` route · role-gated UI · member list + counts · invite-link creation ·
deactivation · cross-user content view · soft-delete tombstone · restore · broadcast
editor · active-notice home banner.

Delivery: 37 existing tests green · sync tests added · auth/share tests added · logged-out
byte-identical · `tsc` + `vite build` clean · dedicated branch · early push (no 403) · PR
opened · ordered manual-steps doc · existing tests not weakened.

## Open questions to resolve in review

- Realtime vs poll-on-focus for inbound — plan defaults to **poll-on-focus** with realtime
  as an optional enhancement (simpler, cheaper). Confirm.
- `campers` (party members) sync scope — owner-scoped only, or crew-shared? Plan: owner-only
  for M3; crews deferred (the v0.2 sketch lists crews but M3 can ship without them).
- Whether to set the repo About website field via `gh` (agent) or by hand (principal).
