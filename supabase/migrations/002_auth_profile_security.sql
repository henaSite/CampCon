-- Phase 2: tighten profile bootstrap and private self-service RLS.
-- Apply after 001_profiles.sql. Profile creation is performed by the auth.users trigger.

alter table public.profiles alter column phone set not null;

-- Keep user-writable fields narrow: id and created_at cannot be changed by clients.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, avatar_url, theme) on table public.profiles to authenticated;

 drop policy if exists "Users can read their own profile" on public.profiles;
 drop policy if exists "Users can insert their own profile" on public.profiles;
 drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_phone text;
begin
  profile_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), '');
  profile_phone := nullif(pg_catalog.regexp_replace(new.raw_user_meta_data ->> 'phone', '[[:space:]()-]', '', 'g'), '');

  if profile_name is null or pg_catalog.char_length(profile_name) < 2 or pg_catalog.char_length(profile_name) > 100 then
    raise exception 'A valid full name is required to create a profile';
  end if;
  if profile_phone is null or profile_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A valid E.164 phone number is required to create a profile';
  end if;

  insert into public.profiles (id, full_name, phone)
  values (new.id, profile_name, profile_phone);
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

-- Ensure timestamps are maintained by the database rather than trusted to clients.
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_profile_updated_at();
