-- Run this migration in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (char_length(module) between 1 and 80),
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists simulations_user_created_idx
  on public.simulations (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.simulations enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read own simulations" on public.simulations;
create policy "Users can read own simulations"
  on public.simulations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own simulations" on public.simulations;
create policy "Users can create own simulations"
  on public.simulations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own simulations" on public.simulations;
create policy "Users can delete own simulations"
  on public.simulations for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
