-- Run this migration in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'student',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'student';

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('student', 'instructor', 'admin'));
  end if;
end
$$;

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (char_length(module) between 1 and 80),
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 10 and 500),
  category text not null,
  duration_minutes integer not null default 45 check (duration_minutes between 5 and 600),
  difficulty text not null default 'foundation'
    check (difficulty in ('foundation', 'intermediate', 'advanced')),
  is_published boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.training_modules
  (slug, title, description, category, duration_minutes, difficulty, is_published, sort_order)
values
  (
    'reservoir-reserves',
    'Reservoir Reserves Lab',
    'Cálculo volumétrico de petróleo in situ e reservas tecnicamente recuperáveis.',
    'Reservoir Engineering',
    45,
    'foundation',
    true,
    10
  ),
  (
    'petroleum-economics',
    'Petroleum Economics Lab',
    'Análise de fluxo de caixa, valor presente líquido, retorno e sensibilidade.',
    'Petroleum Economics',
    60,
    'intermediate',
    false,
    20
  ),
  (
    'hse-decision-trainer',
    'HSE Decision Trainer',
    'Cenários para identificação de perigos e tomada de decisões operacionais seguras.',
    'Health, Safety & Environment',
    40,
    'foundation',
    false,
    30
  )
on conflict (slug) do nothing;

update public.training_modules
set is_published = true, updated_at = now()
where slug in ('petroleum-economics', 'hse-decision-trainer');

create index if not exists simulations_user_created_idx
  on public.simulations (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.simulations enable row level security;
alter table public.training_modules enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso reservado aos administradores'
      using errcode = '42501';
  end if;

  if new_role not in ('student', 'instructor', 'admin') then
    raise exception 'Função inválida'
      using errcode = '22023';
  end if;

  if target_user_id = (select auth.uid()) and new_role <> 'admin' then
    raise exception 'Não pode remover a sua própria função administrativa'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;

  if not found then
    raise exception 'Utilizador não encontrado'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
  on public.profiles for select to authenticated
  using ((select public.is_admin()));

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

drop policy if exists "Admins can read all simulations" on public.simulations;
create policy "Admins can read all simulations"
  on public.simulations for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Published modules are visible" on public.training_modules;
create policy "Published modules are visible"
  on public.training_modules for select to anon, authenticated
  using (is_published);

drop policy if exists "Admins can read all modules" on public.training_modules;
create policy "Admins can read all modules"
  on public.training_modules for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can create modules" on public.training_modules;
create policy "Admins can create modules"
  on public.training_modules for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update modules" on public.training_modules;
create policy "Admins can update modules"
  on public.training_modules for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete modules" on public.training_modules;
create policy "Admins can delete modules"
  on public.training_modules for delete to authenticated
  using ((select public.is_admin()));

create or replace function public.set_training_module_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists training_modules_updated_at on public.training_modules;
create trigger training_modules_updated_at
  before update on public.training_modules
  for each row execute procedure public.set_training_module_updated_at();

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
