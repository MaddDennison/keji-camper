-- ============================================================================
-- Keji Camper — M4 social schema (logbook · tag-a-camper · invite-a-friend)
-- Implements docs/M4-REVIEW.md decisions D1–D7 exactly.
--
-- Run this file pasted into the Supabase SQL editor (see docs/M4-SETUP.md),
-- AFTER 0001_init.sql. The SQL editor runs as `postgres`, which is required:
-- handle_new_user() is re-created here (it gains the share-reconcile step)
-- and shares_before_insert() reads auth.users — both SECURITY DEFINER as
-- postgres. The signup-gate trigger (check_invite_gate) is NOT touched.
--
-- This file is IDEMPOTENT, like 0001: `if not exists` / `create or replace` /
-- drop-then-create policies and triggers; the app_config seed uses
-- `on conflict do nothing`. Re-runs converge to the same schema.
--
-- Security model unchanged: anon key + RLS + column grants + SECURITY DEFINER
-- helpers. Consent-by-schema holds: every entity table keeps
-- `with check (owner = auth.uid())`, so a "share" is only an offer the
-- recipient can READ — the write that lands it in their journal is their own
-- accepted fork, under their own uid. No new write path on entities.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- D3 — `shared` broadcast flag: a COLUMN, never inside `data` jsonb (so the
-- reducer / exports / import-merge can never express "broadcast this", and
-- the sync upsert — whose ON CONFLICT SET covers payload columns only — can
-- never clobber it). Toggled only by the social adapter.
-- ----------------------------------------------------------------------------
alter table public.trips add column if not exists shared boolean not null default false;
alter table public.memories add column if not exists shared boolean not null default false;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- shares: the addressed offers (D5). `from_owner` IS the ref owner — you can
-- only offer what you own, by shape (no re-sharing someone else's content).
-- Exactly one of to_profile / to_email is set; the reconcile trigger and
-- handle_new_user bind to_email → to_profile (clearing to_email), so the
-- num_nonnulls check holds at rest. bundle_id groups a trip with the
-- memories the sharer opted to include (P2).
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('trip', 'memory')),
  from_owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ref_id text not null,
  to_profile uuid references public.profiles (id) on delete cascade,
  to_email text,
  bundle_id uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  dismissed_at timestamptz,
  check (num_nonnulls(to_profile, to_email) = 1),
  check (to_profile is null or to_profile <> from_owner)
);

-- Duplicate offers (same thing, same recipient) are impossible by
-- construction — re-offering after a dismissal = sender deletes + reinserts.
create unique index if not exists shares_unique_to_profile
  on public.shares (kind, from_owner, ref_id, to_profile)
  where to_profile is not null;
create unique index if not exists shares_unique_to_email
  on public.shares (kind, from_owner, ref_id, to_email)
  where to_email is not null;
create index if not exists shares_to_profile_idx on public.shares (to_profile);
create index if not exists shares_from_owner_idx on public.shares (from_owner);

-- app_config: one-row kill-switch (D7). open_invites defaults TRUE (P4).
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  open_invites boolean not null default true
);
insert into public.app_config (id, open_invites) values (true, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Functions (SECURITY DEFINER, SET search_path = public — the 0001 pattern)
-- ----------------------------------------------------------------------------

-- D1 — the invite gate for members. SECURITY DEFINER is the point: an
-- in-policy subquery counting `invites` inside an `invites` policy is the
-- recursive-policy trap (42P17), and would run under the member's own RLS
-- anyway. The cap (10, P4) lives here — one place to change it. Admins are
-- exempt from both the cap and the kill-switch.
create or replace function public.can_create_invite()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (
    public.is_active()
    and coalesce((select open_invites from public.app_config where id), false)
    and (select count(*) from public.invites
          where created_by = auth.uid() and used_at is null) < 10
  );
$$;

-- D4 — "is this row addressed to me?" for the widened entity SELECT.
-- SECURITY DEFINER sidesteps policy→policy RLS interplay entirely.
-- Accepted-but-not-dismissed offers stay readable (the inbox card remains
-- renderable until dismissed).
create or replace function public.has_share_to_me(ref_kind text, p_owner uuid, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shares s
    where s.kind = ref_kind
      and s.from_owner = p_owner
      and s.ref_id = p_id
      and s.to_profile = auth.uid()
      and s.dismissed_at is null
  );
$$;

-- D2 (insert side) — normalize the email and bind it to an EXISTING member
-- immediately, so tagging a member by email works (handle_new_user only
-- fires at signup, and profiles carries no email for the client to match).
-- Runs as postgres so it may read auth.users.
create or replace function public.shares_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if new.to_email is not null then
    new.to_email = lower(trim(new.to_email));
    if new.to_email = '' then
      raise exception 'shares: empty to_email';
    end if;
    select u.id into v_uid from auth.users u
     where lower(u.email) = new.to_email
     limit 1;
    if v_uid is not null then
      new.to_profile = v_uid;
      new.to_email = null;
    end if;
  end if;
  return new;
end;
$$;

-- D2 (signup side) — handle_new_user re-created with the share-reconcile
-- step. Profile bootstrap is byte-identical to 0001; the update runs after
-- the profile insert so the shares.to_profile FK target exists. to_email is
-- already stored lowercased (trigger above), so the match is direct.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case when lower(new.email) = 'maddisondennison85@gmail.com'
         then 'admin' else 'member' end
  );

  update public.shares
     set to_profile = new.id,
         to_email = null
   where to_profile is null
     and to_email = lower(new.email);

  return new;
end;
$$;

revoke execute on function public.can_create_invite() from public, anon;
grant execute on function public.can_create_invite() to authenticated;
revoke execute on function public.has_share_to_me(text, uuid, text) from public, anon;
grant execute on function public.has_share_to_me(text, uuid, text) to authenticated;
revoke execute on function public.shares_before_insert() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Triggers (drop-then-create so a re-run rebinds cleanly)
-- ----------------------------------------------------------------------------

drop trigger if exists keji_shares_before_insert on public.shares;
create trigger keji_shares_before_insert
  before insert on public.shares
  for each row execute function public.shares_before_insert();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.shares enable row level security;
alter table public.app_config enable row level security;

-- D4 — widen trips/memories SELECT. Owner and admin keep tombstone
-- visibility (sync and moderation need it); the social branches — broadcast
-- (`shared`) and targeted offer (`has_share_to_me`) — see LIVE rows only,
-- so a deleted shared row is invisible to the circle. The owner-scoped sync
-- pull (`.eq('owner', uid)` + planInbound's expectedOwner guard) is
-- unaffected: the widened SELECT only ever feeds the separate
-- logbook/inbox queries.
drop policy if exists "trips select own or admin" on public.trips;
drop policy if exists "trips select own admin shared or addressed" on public.trips;
create policy "trips select own admin shared or addressed"
  on public.trips for select
  to authenticated
  using (
    owner = auth.uid()
    or public.is_admin()
    or (deleted_at is null and (shared or public.has_share_to_me('trip', owner, id)))
  );

drop policy if exists "memories select own or admin" on public.memories;
drop policy if exists "memories select own admin shared or addressed" on public.memories;
create policy "memories select own admin shared or addressed"
  on public.memories for select
  to authenticated
  using (
    owner = auth.uid()
    or public.is_admin()
    or (deleted_at is null and (shared or public.has_share_to_me('memory', owner, id)))
  );

-- shares (D5): a member may offer only a LIVE row they own; recipients may
-- read and accept/dismiss what is addressed to them (column grants below
-- narrow the UPDATE to accepted_at/dismissed_at); senders may read and
-- revoke (delete) their own sent offers; admins see everything. Unbound
-- to_email rows are visible only to their sender and the admin. Recipients
-- never DELETE — dismissal is dismissed_at.
drop policy if exists "shares insert own live ref" on public.shares;
create policy "shares insert own live ref"
  on public.shares for insert
  to authenticated
  with check (
    from_owner = auth.uid()
    and public.is_active()
    and (
      (kind = 'trip' and exists (
        select 1 from public.trips t
        where t.owner = auth.uid() and t.id = ref_id and t.deleted_at is null
      ))
      or
      (kind = 'memory' and exists (
        select 1 from public.memories m
        where m.owner = auth.uid() and m.id = ref_id and m.deleted_at is null
      ))
    )
  );

drop policy if exists "shares select recipient sender or admin" on public.shares;
create policy "shares select recipient sender or admin"
  on public.shares for select
  to authenticated
  using (to_profile = auth.uid() or from_owner = auth.uid() or public.is_admin());

drop policy if exists "shares update recipient" on public.shares;
create policy "shares update recipient"
  on public.shares for update
  to authenticated
  using (to_profile = auth.uid())
  with check (to_profile = auth.uid());

drop policy if exists "shares delete sender or admin" on public.shares;
create policy "shares delete sender or admin"
  on public.shares for delete
  to authenticated
  using (from_owner = auth.uid() or public.is_admin());

-- invites (D1): the member paths sit BESIDE 0001's "invites admin all"
-- (policies are OR'd). Members see and may revoke only what they created;
-- creation goes through can_create_invite() (active + kill-switch + cap).
-- No member UPDATE. The signup-gate trigger is unchanged — only WHO may
-- populate the table widened (the M3→M4 relaxation, docs/M4-SOCIAL.md).
drop policy if exists "invites member insert" on public.invites;
create policy "invites member insert"
  on public.invites for insert
  to authenticated
  with check (created_by = auth.uid() and public.can_create_invite());

drop policy if exists "invites member select own" on public.invites;
create policy "invites member select own"
  on public.invites for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "invites member delete own unused" on public.invites;
create policy "invites member delete own unused"
  on public.invites for delete
  to authenticated
  using (created_by = auth.uid() and used_at is null);

-- app_config (D7): everyone signed-in may read (the UI can say "invites are
-- off"); only admins flip the switch. No client INSERT/DELETE — the seed
-- above is the only row there will ever be.
drop policy if exists "app_config select authenticated" on public.app_config;
create policy "app_config select authenticated"
  on public.app_config for select
  to authenticated
  using (true);

drop policy if exists "app_config update admin" on public.app_config;
create policy "app_config update admin"
  on public.app_config for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Grants (column-level hardening on top of RLS, the 0001 pattern)
-- ----------------------------------------------------------------------------

-- Entity tables: the UPDATE grant gains `shared` so owners can toggle the
-- broadcast flag (the social adapter's dedicated update — the sync upsert
-- never sends it). Additive on top of 0001's grant; re-runs are no-ops.
grant update (shared) on table public.trips to authenticated;
grant update (shared) on table public.memories to authenticated;

-- shares: INSERT may carry the addressing columns (from_owner defaults to
-- auth.uid() and RLS pins it); UPDATE is accepted_at/dismissed_at ONLY — a
-- recipient can answer an offer but never rewrite it; DELETE is the sender's
-- revoke (RLS-narrowed). created_at/id stay server-set.
revoke all on table public.shares from anon, authenticated;
grant select on table public.shares to authenticated;
grant insert (kind, from_owner, ref_id, to_profile, to_email, bundle_id) on table public.shares to authenticated;
grant update (accepted_at, dismissed_at) on table public.shares to authenticated;
grant delete on table public.shares to authenticated;

-- app_config: read for all signed-in; only the switch column is writable
-- (RLS narrows the writer to admins).
revoke all on table public.app_config from anon, authenticated;
grant select on table public.app_config to authenticated;
grant update (open_invites) on table public.app_config to authenticated;

-- invites: 0001 granted full DML (RLS narrowed it to admins). Now that
-- members can insert too, narrow the columns: a full-row INSERT would let a
-- member preset used_by/used_at — a pre-used invite admits nobody (the gate
-- matches `used_at is null` only), but it would fake edges in the referral
-- tree and dodge the unused-count cap. Nothing client-side ever UPDATEs
-- invites (the gate trigger stamps used_by/used_at as definer), so that
-- grant goes entirely.
revoke insert, update on table public.invites from authenticated;
grant insert (email, created_by) on table public.invites to authenticated;
