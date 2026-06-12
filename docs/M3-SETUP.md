# M3 manual setup — Supabase (one-time, principal only)

These are the only non-code steps for M3. Do them in order, in the Supabase
dashboard for the project (`https://tpmeokrahngjrakwnjio.supabase.co`).
Everything else (env vars, client code) ships in the repo. No `service_role`
key is needed anywhere — do not copy it out of the dashboard for any step.

## 1. Run the migration

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the entire contents of `supabase/migrations/0001_init.sql` and run it.
3. It should finish with "Success. No rows returned."

Why the SQL editor: it runs as the `postgres` role. The migration creates two
triggers **on `auth.users`** (the invite gate and the profile bootstrap), and
their `SECURITY DEFINER` functions end up owned by `postgres` — which is
exactly what lets them fire during signup and write into `public.profiles` /
`public.invites`. Running the file as any lesser role would fail; in the SQL
editor it just works.

The file is idempotent (`if not exists` / `create or replace` /
`drop ... if exists`), so a re-run — including after a failed partial run — is
safe and converges to the same schema. Note that `create table if not exists`
will not alter an existing table's columns, so if you ever change a column
here you must migrate it explicitly rather than relying on a re-run.

## 2. Enable the Email provider (6-digit codes)

1. Go to **Authentication → Sign In / Providers**.
2. Enable the **Email** provider — no passwords.
3. The app signs in with a **6-digit email code** (`signInWithOtp` →
   `verifyOtp`), not a clickable link. Clickable magic links proved fragile on
   mobile: only the newest link works, mail-app link scanners consume the
   single-use token before you tap, and the link often opens in a different
   in-app browser than the one that requested it. A typed code sidesteps all of
   that.

### 2a. Put the code in the email template (REQUIRED for code sign-in)

By default the Magic Link email contains only a link, so no code is shown. Add
the token:

1. Go to **Authentication → Emails → Templates → Magic Link**.
2. Make sure the body includes the **`{{ .Token }}`** variable, e.g.:

   ```html
   <h2>Your Keji Camper sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:24px;letter-spacing:3px"><b>{{ .Token }}</b></p>
   <p>It expires in an hour. If you didn’t request it, ignore this email.</p>
   ```

   You can keep `{{ .ConfirmationURL }}` as a fallback link if you like, but the
   code is what the app asks for. Without `{{ .Token }}` the email has no code
   and sign-in cannot complete.

## 3. Set the Site URL

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to `https://kejicamper.ca`.

This is still the canonical origin for the project. (The code flow doesn't rely
on a redirect, but if any clickable link remains in the template it lands here,
and the app surfaces a clear message if a stale link is ever followed.)

## Email deliverability (do before real use)

The built-in Supabase email sender is **test-grade**: a low hourly cap (you will
hit "please wait N seconds" cooldowns) and it often lands in spam. Before
inviting real people, wire **custom SMTP** (Resend, Postmark, SendGrid, or
Amazon SES) under **Authentication → Emails → SMTP Settings**. This raises the
limits and fixes deliverability.

## Things to know (not action items)

- **Uninvited signups fail with a 500 — by design.** The invite gate is a
  database trigger on `auth.users`, not a client check. Anyone who tries a
  magic-link signup without a matching unused invite gets a generic
  `500 Database error saving new user` from Supabase. That opaque error is the
  intended behaviour (it leaks nothing about who is invited); it is not a bug
  to investigate.
- **Your email is the sole admin seed.** `maddisondennison85@gmail.com`
  bypasses the invite gate and is created as the only `admin`. Everyone else
  is `member`, invited by inserting an `invites` row from the admin page.
  _(In M3 only the admin can create invites; M4 plans to let any member invite a
  friend — email-gated, rate-capped, admin-revocable. See `docs/M4-SOCIAL.md`.)_
- **Deactivation vs. banning.** The admin page "deactivate" action blocks a
  member's writes (RLS checks `profiles.deactivated_at`) but does not log them
  out or block sign-in. A true auth-level ban is a manual dashboard action:
  **Authentication → Users → (user) → Ban user**. The app never automates
  this — it would require the `service_role` key.
- **No `photos` storage bucket in M3.** Photos travel as data-URLs inside
  `memories.data`. The bucket is deliberately descoped to M4
  (see `docs/M3-REVIEW.md`, decision D3) — do not create one now.
