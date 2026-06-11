-- ============================================================================
-- Keji Camper — M3 initial schema (accounts · sync · admin)
-- Implements docs/M3-REVIEW.md decision D2 exactly.
--
-- Run this file ONCE, pasted into the Supabase SQL editor (see docs/M3-SETUP.md).
-- The SQL editor runs as the `postgres` role, which is required: the two
-- triggers on auth.users below must be owned by postgres to be created there,
-- and their SECURITY DEFINER functions run as postgres so they may write to
-- public.profiles / public.invites during signup.
--
-- Security model: the publishable anon key is the only key the client ever
-- holds; every boundary here is RLS + column grants + SECURITY DEFINER RPCs.
-- There is NO storage bucket in M3 (photos descoped to M4 per D3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- gen_random_bytes lives in pgcrypto (Supabase installs it in `extensions`).
-- gen_random_uuid() is core Postgres and needs nothing.
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: one row per auth user, created by trigger on signup.
-- `role` is NEVER client-writable (column grants below) and the signup trigger
-- hardcodes it — privileged fields are never copied from raw_user_meta_data.
-- Note: paddle_kmh / hike_kmh deliberately absent — settings stay local-only.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  emoji text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  bio text not null default '',
  deactivated_at timestamptz,
  joined_at timestamptz not null default now()
);

-- trips / memories / campers: one row per reducer entity. The client's whole
-- entity travels in `data` jsonb; the composite PK (owner, id) makes
-- cross-user client-id collisions impossible by construction. `deleted_at`
-- is a soft-delete tombstone (never SQL DELETE), so deletes can propagate.
create table public.trips (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id)
);

create table public.memories (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id)
);

create table public.campers (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id)
);

-- invites: the DB-side signup gate. Creating an invite = inserting a row here
-- (admin-only via RLS); the BEFORE INSERT trigger on auth.users is the gate.
create table public.invites (
  code text primary key default encode(extensions.gen_random_bytes(8), 'hex'),
  email text not null,
  created_by uuid,
  used_by uuid,
  created_at timestamptz default now(),
  used_at timestamptz
);

-- notices: admin broadcast banner. Session-gated SELECT keeps the logged-out
-- app untouched (the banner only renders when signed in).
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  active boolean not null default false,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Functions (all SECURITY DEFINER, SET search_path = public)
--
-- is_admin()/is_active() are SECURITY DEFINER precisely so the policies that
-- call them read profiles WITHOUT re-entering profiles' own RLS — this is the
-- standard fix for the recursive-policy trap (error 42P17). Neither function
-- queries any table whose policies call back into it.
-- ----------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and deactivated_at is null
  );
$$;

-- Signup gate: BEFORE INSERT ON auth.users. The admin seed email always
-- passes; everyone else must match an unused invites row by lowercased email,
-- which is stamped used_by/used_at atomically (FOR UPDATE row lock), else the
-- insert is aborted. Rejected signups surface to the client as a generic
-- 500 "Database error saving new user" — by design (see docs/M3-SETUP.md).
create function public.check_invite_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'maddisondennison85@gmail.com' then
    return new;
  end if;

  update public.invites
     set used_by = new.id,
         used_at = now()
   where code = (
     select code from public.invites
      where lower(email) = lower(new.email)
        and used_at is null
      order by created_at
      limit 1
      for update
   );

  if not found then
    raise exception 'signup not permitted: no unused invite for this email';
  end if;

  return new;
end;
$$;

-- Profile bootstrap: AFTER INSERT ON auth.users. Role is hardcoded 'member'
-- except the sole admin seed email. Display fields start blank; NOTHING is
-- ever copied from raw_user_meta_data (it is client-controlled).
create function public.handle_new_user()
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
  return new;
end;
$$;

-- updated_at maintenance for the three entity tables. Server-side arrival
-- time: conflict resolution is honestly "last-upload-wins per entity" (D1).
create function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin moderation RPCs. There is NO generic admin UPDATE policy on any
-- table; admins can only flip these two columns, via these two functions.
-- Table name goes through a CASE whitelist — never dynamic SQL from input.
-- Campers are intentionally NOT whitelisted: they are owner-only (D4), so
-- admins can neither see nor moderate them.
create function public.admin_set_deleted(
  tbl text,
  target_owner uuid,
  target_id text,
  del boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  case tbl
    when 'trips' then
      update public.trips
         set deleted_at = case when del then now() else null end
       where owner = target_owner and id = target_id;
    when 'memories' then
      update public.memories
         set deleted_at = case when del then now() else null end
       where owner = target_owner and id = target_id;
    else
      raise exception 'admin_set_deleted: table % not allowed', tbl;
  end case;
end;
$$;

create function public.admin_set_deactivated(
  target uuid,
  deact boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.profiles
     set deactivated_at = case when deact then now() else null end
   where id = target;
end;
$$;

-- Only signed-in users may call the RPCs; the trigger functions are not
-- callable by clients at all.
revoke execute on function public.admin_set_deleted(text, uuid, text, boolean) from public, anon;
revoke execute on function public.admin_set_deactivated(uuid, boolean) from public, anon;
grant execute on function public.admin_set_deleted(text, uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_deactivated(uuid, boolean) to authenticated;
revoke execute on function public.check_invite_gate() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- Gate first (BEFORE), then bootstrap the profile (AFTER, so the FK target
-- row in auth.users exists).
create trigger keji_check_invite_gate
  before insert on auth.users
  for each row execute function public.check_invite_gate();

create trigger keji_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger keji_trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

create trigger keji_memories_touch_updated_at
  before update on public.memories
  for each row execute function public.touch_updated_at();

create trigger keji_campers_touch_updated_at
  before update on public.campers
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- Enabled on every table; anon gets nothing anywhere (and grants below also
-- strip anon), so the logged-out app touches none of this.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.memories enable row level security;
alter table public.campers enable row level security;
alter table public.invites enable row level security;
alter table public.notices enable row level security;

-- profiles: any signed-in user can read everyone (member list, display names);
-- you may update only your own row — and column grants below further restrict
-- WHICH columns (role / deactivated_at / joined_at are not client-writable).
create policy "profiles select authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- trips: owner read/write (writes require an active profile); admins may
-- additionally SELECT all rows (moderation view) but have no UPDATE policy —
-- admin writes go through admin_set_deleted() only. Owner SELECT includes
-- tombstoned rows so tombstones can propagate to the owner's other devices.
create policy "trips select own or admin"
  on public.trips for select
  to authenticated
  using (owner = auth.uid() or public.is_admin());

create policy "trips insert own active"
  on public.trips for insert
  to authenticated
  with check (owner = auth.uid() and public.is_active());

create policy "trips update own active"
  on public.trips for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and public.is_active());

-- memories: identical to trips.
create policy "memories select own or admin"
  on public.memories for select
  to authenticated
  using (owner = auth.uid() or public.is_admin());

create policy "memories insert own active"
  on public.memories for insert
  to authenticated
  with check (owner = auth.uid() and public.is_active());

create policy "memories update own active"
  on public.memories for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and public.is_active());

-- campers: same shape but strictly owner-only — no admin SELECT (D4: campers
-- are excluded from admin views and counts; do not widen this for a count).
create policy "campers select own"
  on public.campers for select
  to authenticated
  using (owner = auth.uid());

create policy "campers insert own active"
  on public.campers for insert
  to authenticated
  with check (owner = auth.uid() and public.is_active());

create policy "campers update own active"
  on public.campers for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and public.is_active());

-- invites: admin-only for everything. Creating an invite row IS inviting;
-- the auth.users trigger above is the actual gate.
create policy "invites admin all"
  on public.invites for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- notices: any signed-in user may read (home banner is session-gated in the
-- client, preserving the logged-out invariant); only admins write.
create policy "notices select authenticated"
  on public.notices for select
  to authenticated
  using (true);

create policy "notices insert admin"
  on public.notices for insert
  to authenticated
  with check (public.is_admin());

create policy "notices update admin"
  on public.notices for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "notices delete admin"
  on public.notices for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Grants (column-level hardening on top of RLS)
-- Supabase grants broad table privileges to anon/authenticated by default;
-- revoke everything first, then grant back exactly what the client needs.
-- ----------------------------------------------------------------------------

-- profiles: role/deactivated_at/joined_at are NOT in the UPDATE grant, so the
-- "one UPDATE away from admin" footgun is closed at the grant layer too.
-- No INSERT/DELETE grant: rows are created by the signup trigger only.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, emoji, bio) on table public.profiles to authenticated;

-- Entity tables: clients may insert (owner, id, data) and update
-- (data, deleted_at). updated_at is trigger-maintained, never client-set.
-- deleted_at being client-updatable means owners can clear their OWN
-- tombstone — accepted for a family-scale app (documented in M3-REVIEW.md);
-- admin tombstones on someone else's rows are out of owners' reach via RLS.
-- No DELETE grant anywhere: deletes are tombstones, never SQL DELETE.
revoke all on table public.trips from anon, authenticated;
grant select on table public.trips to authenticated;
grant insert (owner, id, data) on table public.trips to authenticated;
grant update (data, deleted_at) on table public.trips to authenticated;

revoke all on table public.memories from anon, authenticated;
grant select on table public.memories to authenticated;
grant insert (owner, id, data) on table public.memories to authenticated;
grant update (data, deleted_at) on table public.memories to authenticated;

revoke all on table public.campers from anon, authenticated;
grant select on table public.campers to authenticated;
grant insert (owner, id, data) on table public.campers to authenticated;
grant update (data, deleted_at) on table public.campers to authenticated;

-- invites: full DML for authenticated at the grant layer; RLS narrows it to
-- admins. (used_by/used_at stamping at signup happens via SECURITY DEFINER.)
revoke all on table public.invites from anon, authenticated;
grant select, insert, update, delete on table public.invites to authenticated;

-- notices: same pattern — grants to authenticated, RLS gates writes to admin.
revoke all on table public.notices from anon, authenticated;
grant select, insert, update, delete on table public.notices to authenticated;
