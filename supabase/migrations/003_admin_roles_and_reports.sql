-- Phase 3: administrative roles, audit trail, and content reporting.
-- Apply after 001_profiles.sql and 002_auth_profile_security.sql.
-- Role changes are only possible through set_profile_role(), or trusted SQL/service-role operations.

alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'super_admin', 'admin', 'moderator'));

-- Keep role assignment out of ordinary profile updates. The narrow profile update grant
-- from 002_auth_profile_security.sql deliberately does not include this column.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_created_at_idx
  on public.activity_logs (actor_id, created_at desc);

alter table public.activity_logs enable row level security;
revoke all on table public.activity_logs from anon, authenticated;
grant select on table public.activity_logs to authenticated;

create policy "Administrators can read activity logs"
  on public.activity_logs for select to authenticated
  using ((select public.current_user_role()) in ('super_admin', 'admin'));

-- Audit rows are append-only for clients. Trusted server-side code may write via
-- service_role; security-definer database functions may also write as needed.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('lost_item', 'found_item', 'profile', 'message')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'fraud', 'unsafe', 'harassment', 'inaccurate', 'other')),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  constraint content_reports_review_fields_check check (
    (status = 'open' and reviewed_by is null and reviewed_at is null)
    or (status <> 'open' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists content_reports_status_created_at_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter_created_at_idx
  on public.content_reports (reporter_id, created_at desc);
create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);

alter table public.content_reports enable row level security;
revoke all on table public.content_reports from anon, authenticated;
grant select on table public.content_reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, description)
  on table public.content_reports to authenticated;
grant update (status, reviewed_by, reviewed_at, resolution_note)
  on table public.content_reports to authenticated;

create policy "Users can submit reports for themselves"
  on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Users can read their own reports"
  on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Moderators and administrators can read all reports"
  on public.content_reports for select to authenticated
  using ((select public.current_user_role()) in ('super_admin', 'admin', 'moderator'));

create policy "Moderators and administrators can review reports"
  on public.content_reports for update to authenticated
  using ((select public.current_user_role()) in ('super_admin', 'admin', 'moderator'))
  with check (
    (select public.current_user_role()) in ('super_admin', 'admin', 'moderator')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
    and status <> 'open'
  );

-- This is the only client-callable path for role assignments. The function checks
-- the caller's role using a security-definer helper, then records the change in the
-- append-only audit log. Non-super-admins cannot promote themselves or others.
create or replace function public.set_profile_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
begin
  if (select public.current_user_role()) <> 'super_admin' then
    raise exception 'Only a super administrator can assign roles' using errcode = '42501';
  end if;

  if new_role not in ('user', 'super_admin', 'admin', 'moderator') then
    raise exception 'Invalid profile role' using errcode = '22023';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id
  returning role into previous_role;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    'profile_role_changed',
    'profile',
    target_user_id,
    jsonb_build_object('role', new_role)
  );
end;
$$;

revoke all on function public.set_profile_role(uuid, text) from public, anon;
grant execute on function public.set_profile_role(uuid, text) to authenticated;
