-- Phase 4: administrator user search and application-access suspension controls.
-- Apply after 003_admin_roles_and_reports.sql.
-- Suspension here is an application status, not a Supabase Auth ban. Production-wide
-- account blocking should additionally use a trusted server/Edge Function to ban Auth.

alter table public.profiles
  add column if not exists suspended_at timestamptz;

create index if not exists profiles_suspended_at_idx
  on public.profiles (suspended_at) where suspended_at is not null;

create or replace function public.admin_search_users(search_term text default '')
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  suspended_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := pg_catalog.btrim(coalesce(search_term, ''));
begin
  if (select public.current_user_role()) not in ('super_admin', 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.suspended_at, p.created_at
    from public.profiles as p
    join auth.users as u on u.id = p.id
    where term = ''
      or p.full_name ilike '%' || term || '%'
      or coalesce(u.email, '') ilike '%' || term || '%'
      or p.phone ilike '%' || term || '%'
    order by p.created_at desc
    limit 50;
end;
$$;

revoke all on function public.admin_search_users(text) from public, anon;
grant execute on function public.admin_search_users(text) to authenticated;

create or replace function public.set_profile_suspension(target_user_id uuid, should_suspend boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if (select public.current_user_role()) not in ('super_admin', 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot suspend your own account' using errcode = '42501';
  end if;

  select p.role into target_role from public.profiles as p where p.id = target_user_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if target_role = 'super_admin' and (select public.current_user_role()) <> 'super_admin' then
    raise exception 'Only a super administrator can modify a super administrator account' using errcode = '42501';
  end if;

  update public.profiles
  set suspended_at = case when should_suspend then pg_catalog.now() else null end
  where id = target_user_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    case when should_suspend then 'profile_suspended' else 'profile_restored' end,
    'profile',
    target_user_id,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.set_profile_suspension(uuid, boolean) from public, anon;
grant execute on function public.set_profile_suspension(uuid, boolean) to authenticated;
