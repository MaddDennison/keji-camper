# M4 manual setup — Supabase (one-time, principal only)

These are the only non-code steps for M4. Everything else ships in the repo.
M3 must already be live (0001 run, Email provider + `{{ .Token }}` template,
Site URL, custom SMTP — per `docs/M3-SETUP.md`). No `service_role` key is
needed anywhere — do not copy it out of the dashboard for any step.

## 1. Run the migration

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the entire contents of `supabase/migrations/0002_social.sql` and run it.
3. It should finish with "Success. No rows returned."

Why the SQL editor: it runs as `postgres`. The migration re-creates
`handle_new_user()` (it gains the share-reconcile step) and creates
`shares_before_insert()`, which reads `auth.users` to bind an email-addressed
share to an existing member — both need to be owned by `postgres`. The signup
gate trigger (`check_invite_gate`) is **not** touched.

The file is idempotent like 0001 (`if not exists` / `create or replace` /
drop-then-create policies and triggers; the `app_config` seed is
`on conflict do nothing`), so a re-run — including after a failed partial
run — is safe and converges to the same schema.

## 2. Verify (optional, 1 minute)

Run in the SQL editor:

```sql
select open_invites from public.app_config;          -- one row: true
select count(*) from pg_policies
 where tablename in ('shares','app_config');         -- 6
select public.can_create_invite();                   -- runs without error
```

## 3. There is no step 3

No dashboard settings change in M4. Auth, templates, SMTP, and the Site URL
all stay exactly as M3 configured them: an invited friend signs in with the
same emailed code + "I have a code" path members already use. The app
operates **no mailer of its own** — invites are copyable notes the inviting
member sends however they like (docs/M4-REVIEW.md, P3).

## Things to know (not action items)

- **Member invites are ON from the moment the migration runs** (`open_invites
  = true`, per P4). Any active member can invite up to **10** outstanding
  not-yet-used emails; admins are exempt from the cap. If you want the M3
  admin-only posture until you're ready, flip the switch off on the Admin
  page (or `update public.app_config set open_invites = false;`).
- **The kill-switch stops invite *creation*, not *use*.** Unused invites
  minted while the switch was on remain redeemable after you flip it off. The
  full clamp is: flip the switch **and** revoke unused invites — the Admin
  page has both, side by side (docs/M4-REVIEW.md, D7).
- **Sharing is consent-by-schema, same as M3.** A share is only an offer the
  recipient can read; nothing ever writes into someone else's journal. The
  copy is created by the recipient's own "save" under their own uid.
- **Deleting a shared trip hides it from the circle immediately.** The
  broadcast/addressed read paths see live rows only; your own devices still
  see the tombstone so the delete syncs.
- **Photos still travel as data-URLs** inside shared/forked memories — the
  object-storage move stays deferred (docs/M4-REVIEW.md, D8/Q6). Opting a
  memory into a share or the logbook shows its photos to the recipients /
  the whole circle, and every accepted copy holds the photos in full. The
  trip-plan-only sharing default keeps photos private unless explicitly
  included.
- **Uninvited signups still fail with the same generic 500** — the gate
  trigger is unchanged; only *who may populate* the `invites` table widened.
