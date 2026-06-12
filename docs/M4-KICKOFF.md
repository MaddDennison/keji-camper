# M4 kickoff — seed prompt for the social/invite session

> Paste the block below into a fresh Claude Code session (or just tell the
> session "follow docs/M4-KICKOFF.md"). It bootstraps the M4 "light social"
> milestone in the plan → adversarial review → binding-decisions → build style
> M3 used. It is self-contained: everything it needs lives in the repo docs, so
> the new session needs no memory of how M3 was built.

---

You're picking up the M4 "light social" milestone for the Keji Camper app
(repo: MaddDennison/keji-camper). M3 — accounts, sync, admin, magic-code
sign-in, custom SMTP — is merged and live on kejicamper.ca. Do NOT start
coding yet: this milestone follows the same discipline as M3 — plan →
adversarial review → binding-decisions doc → build.

READ FIRST (in this order):
- docs/M4-SOCIAL.md   — the M4 plan (shared logbook · tag-a-camper ·
  invite-a-friend). This is your spec.
- docs/M3-REVIEW.md   — the binding-decisions format to mirror, and the
  hardened invariants you must preserve.
- docs/M3-PLAN.md     — the plan-doc house style.
- docs/ARCHITECTURE.md and docs/PLAN.md — stack, data model, roadmap.
- src/lib/sync.ts + src/lib/useSync.tsx — the pure-core/adapter split and
  the owner-scoped sync you must not break.
- supabase/migrations/0001_init.sql — the RLS/grants/trigger patterns to
  extend (your migration is 0002_social.sql, and must be idempotent like 0001).

YOUR TASK, PHASE 1 — adversarial review (no code):
Run three critical lenses over docs/M4-SOCIAL.md, exactly as M3 did:
  (1) invariants/architecture, (2) security/RLS, (3) sync + consent/fork
  correctness. Surface every blocker. Then write docs/M4-REVIEW.md recording
  the binding decisions and where the build deviates from the plan ("where this
  doc and M4-SOCIAL.md disagree, this doc wins").

HARD INVARIANTS (do not violate):
- The reducer in src/lib/store.tsx is the single write path; a fork is just
  trip/save / memory/save with a fresh id + origin stamp. Reducer untouched.
- App stays 100% functional logged-out, byte-identical.
- Sync stays owner-scoped (pull filters .eq('owner', uid); planInbound has the
  expectedOwner guard). Social reads (logbook/inbox) use a SEPARATE ephemeral
  query and never touch the reducer or sync baseline.
- anon key + RLS only; never service_role anywhere.
- Consent-by-schema: every entity table keeps with check (owner = auth.uid()),
  so no one can write a row they don't own — forks land under the recipient's
  own uid.
- Pure logic in a testable pure module (no React/supabase/browser globals) +
  thin adapter, with pure-node vitest tests. All existing tests stay green.

DECISIONS ALREADY MADE (don't relitigate; the review may scrutinize the
trade-offs but shouldn't reopen these):
- A shared trip is a COPY (fork-on-accept), not a co-owned document.
- Member-driven invites are a deliberate, BOUNDED relaxation of M3's admin-only
  model: email gate retained, every invite attributed (created_by), per-member
  rate cap, admin kill-switch. No open registration.
- Photos stay data-URLs unless you bundle the object-storage move (D3); flag the
  privacy implication of sharing photos.

PRODUCT CALLS TO SURFACE (use AskUserQuestion before finalizing — these are the
principal's to decide, see the open-questions list in M4-SOCIAL.md):
- Ship targeted tag-a-camper first, or with the broadcast logbook too?
- Accept forks the trip only, or trip + its linked memories?
- Invite delivery: copy-a-link (recommended, no app mailer) vs transactional
  email — note SMTP is already wired via Resend, and sign-in already uses a
  6-digit code + verifyOtp, so an invited friend would arrive, sign in with a
  code, and use the "I have a code" path. Reuse that, don't reinvent.
- Per-member invite cap number, and open-invites default (on vs off).

REAL-WORLD GOTCHAS we hit in M3 (design around them):
- VITE_SUPABASE_URL must be the bare project origin (a pasted /rest/v1 broke
  every auth call). normalizeSupabaseUrl now guards this.
- Email OTP length is configurable; the sign-in input shouldn't hardcode a
  length. Built-in Supabase email is rate-limited; custom SMTP is configured.
- The Magic Link email template needs {{ .Token }} for the code to appear.

PHASE 2 — build (only after the principal approves the review + product calls):
- Dedicated branch claude/m4-social-<something>; idempotent 0002_social.sql
  pasted by the principal into the SQL editor (write docs/M4-SETUP.md with the
  steps).
- Additive only; reducer never edited; logged-out parity preserved.
- New pure tests for fork/provenance/dedup, addressed-vs-broadcast planning,
  email→profile share reconcile, and the invite-cap boundary.
- Open a DRAFT PR. (Note: the GitHub MCP server may need re-auth — run the
  authenticate flow if its tools are missing.)

Start by reading the docs above, then give the principal the review findings
and the list of product calls you need decided before writing any code.
