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

update public.training_modules
set
  title = case slug
    when 'reservoir-reserves' then 'Laboratório de Reservas de Reservatório'
    when 'petroleum-economics' then 'Laboratório de Economia do Petróleo'
    when 'hse-decision-trainer' then 'Simulador de Decisões HSE'
    else title
  end,
  category = case slug
    when 'reservoir-reserves' then 'Engenharia de Reservatórios'
    when 'petroleum-economics' then 'Economia do Petróleo'
    when 'hse-decision-trainer' then 'Saúde, Segurança e Ambiente'
    else category
  end,
  updated_at = now()
where
  (slug = 'reservoir-reserves' and title = 'Reservoir Reserves Lab')
  or (slug = 'petroleum-economics' and title = 'Petroleum Economics Lab')
  or (slug = 'hse-decision-trainer' and title = 'HSE Decision Trainer');

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

-- Plataforma profissional: perfis, controlo de acesso e certificação.
alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists country text default 'Moçambique',
  add column if not exists city text,
  add column if not exists professional_status text not null default 'student',
  add column if not exists education_area text,
  add column if not exists institution text,
  add column if not exists job_title text,
  add column if not exists bio text,
  add column if not exists account_status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_professional_status_check'
  ) then
    alter table public.profiles add constraint profiles_professional_status_check
      check (professional_status in (
        'student', 'professor', 'researcher', 'employee', 'technician',
        'engineer', 'manager', 'consultant', 'job_seeker', 'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles add constraint profiles_account_status_check
      check (account_status in ('active', 'suspended'));
  end if;
end
$$;

update public.profiles as profile
set
  email = auth_user.email,
  full_name = coalesce(
    nullif(profile.full_name, ''),
    nullif(profile.display_name, ''),
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    split_part(auth_user.email, '@', 1)
  ),
  display_name = coalesce(
    nullif(profile.display_name, ''),
    nullif(profile.full_name, ''),
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    split_part(auth_user.email, '@', 1)
  ),
  phone = coalesce(profile.phone, auth_user.raw_user_meta_data ->> 'phone'),
  country = coalesce(profile.country, auth_user.raw_user_meta_data ->> 'country', 'Moçambique'),
  city = coalesce(profile.city, auth_user.raw_user_meta_data ->> 'city'),
  education_area = coalesce(profile.education_area, auth_user.raw_user_meta_data ->> 'education_area'),
  institution = coalesce(profile.institution, auth_user.raw_user_meta_data ->> 'institution'),
  job_title = coalesce(profile.job_title, auth_user.raw_user_meta_data ->> 'job_title')
from auth.users as auth_user
where profile.id = auth_user.id;

alter table public.training_modules
  add column if not exists default_student_access boolean not null default true,
  add column if not exists certificate_enabled boolean not null default true,
  add column if not exists passing_score integer not null default 70;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'training_modules_passing_score_check'
  ) then
    alter table public.training_modules add constraint training_modules_passing_score_check
      check (passing_score between 0 and 100);
  end if;
end
$$;

alter table public.simulations
  add column if not exists module_slug text;

update public.simulations
set module_slug = case module
  when 'Reservoir Reserves Lab' then 'reservoir-reserves'
  when 'Petroleum Economics Lab' then 'petroleum-economics'
  when 'HSE Decision Trainer' then 'hse-decision-trainer'
  else module_slug
end
where module_slug is null;

create table if not exists public.lab_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  access_level text not null default 'student'
    check (access_level in ('student', 'trainer')),
  is_allowed boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_id, access_level),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  simulation_id uuid references public.simulations(id) on delete set null,
  certificate_code text not null unique default (
    'PSL-' || to_char(now(), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  final_score numeric(5,2) not null default 100
    check (final_score between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  unique (user_id, module_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  module_id uuid references public.training_modules(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_status_idx
  on public.profiles (role, account_status);
create index if not exists profiles_email_idx
  on public.profiles (lower(email));
create index if not exists lab_access_user_idx
  on public.lab_access_grants (user_id, access_level);
create index if not exists certificates_user_issued_idx
  on public.certificates (user_id, issued_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

alter table public.lab_access_grants enable row level security;
alter table public.certificates enable row level security;
alter table public.audit_logs enable row level security;

grant select on table public.lab_access_grants to authenticated;
grant select on table public.certificates to authenticated;
grant select on table public.audit_logs to authenticated;

create or replace function public.is_active_user()
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
      and account_status = 'active'
  );
$$;

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
      and account_status = 'active'
  );
$$;

create or replace function public.can_access_lab(p_module_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles%rowtype;
  current_module public.training_modules%rowtype;
  explicit_grant public.lab_access_grants%rowtype;
  required_level text;
begin
  select * into current_profile
  from public.profiles
  where id = (select auth.uid());

  if current_profile.id is null or current_profile.account_status <> 'active' then
    return false;
  end if;

  if current_profile.role = 'admin' then
    return true;
  end if;

  select * into current_module
  from public.training_modules
  where slug = p_module_slug;

  if current_module.id is null or not current_module.is_published then
    return false;
  end if;

  required_level := case
    when current_profile.role = 'instructor' then 'trainer'
    else 'student'
  end;

  select * into explicit_grant
  from public.lab_access_grants
  where user_id = current_profile.id
    and module_id = current_module.id
    and access_level = required_level;

  if explicit_grant.id is not null then
    return explicit_grant.is_allowed
      and (explicit_grant.starts_at is null or explicit_grant.starts_at <= now())
      and (explicit_grant.expires_at is null or explicit_grant.expires_at > now());
  end if;

  if required_level = 'trainer' then
    return false;
  end if;

  return current_module.default_student_access;
end;
$$;

revoke all on function public.is_active_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.can_access_lab(text) from public, anon, authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_lab(text) to authenticated;

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
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

  select role into previous_role
  from public.profiles
  where id = target_user_id;

  if previous_role is null then
    raise exception 'Utilizador não encontrado'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set role = new_role, updated_at = now()
  where id = target_user_id;

  insert into public.audit_logs (actor_id, action, target_user_id, metadata)
  values (
    (select auth.uid()),
    'user.role_changed',
    target_user_id,
    jsonb_build_object('previous_role', previous_role, 'new_role', new_role)
  );
end;
$$;

create or replace function public.admin_set_account_status(
  target_user_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if not public.is_admin() then
    raise exception 'Acesso reservado aos administradores'
      using errcode = '42501';
  end if;

  if new_status not in ('active', 'suspended') then
    raise exception 'Estado de conta inválido'
      using errcode = '22023';
  end if;

  if target_user_id = (select auth.uid()) and new_status <> 'active' then
    raise exception 'Não pode suspender a sua própria conta administrativa'
      using errcode = '42501';
  end if;

  select account_status into previous_status
  from public.profiles
  where id = target_user_id;

  if previous_status is null then
    raise exception 'Utilizador não encontrado'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set account_status = new_status, updated_at = now()
  where id = target_user_id;

  insert into public.audit_logs (actor_id, action, target_user_id, metadata)
  values (
    (select auth.uid()),
    'user.status_changed',
    target_user_id,
    jsonb_build_object('previous_status', previous_status, 'new_status', new_status)
  );
end;
$$;

create or replace function public.admin_set_lab_access(
  target_user_id uuid,
  target_module_id uuid,
  access_kind text,
  allowed boolean,
  access_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'Acesso reservado aos administradores'
      using errcode = '42501';
  end if;

  if access_kind not in ('student', 'trainer') then
    raise exception 'Tipo de acesso inválido'
      using errcode = '22023';
  end if;

  select role into target_role
  from public.profiles
  where id = target_user_id;

  if target_role is null then
    raise exception 'Utilizador não encontrado'
      using errcode = 'P0002';
  end if;

  if access_kind = 'trainer' and target_role <> 'instructor' then
    raise exception 'Acesso de formador requer a função Formador'
      using errcode = '22023';
  end if;

  insert into public.lab_access_grants (
    user_id, module_id, access_level, is_allowed, expires_at, assigned_by
  )
  values (
    target_user_id, target_module_id, access_kind, allowed,
    access_expires_at, (select auth.uid())
  )
  on conflict (user_id, module_id, access_level)
  do update set
    is_allowed = excluded.is_allowed,
    expires_at = excluded.expires_at,
    assigned_by = excluded.assigned_by,
    updated_at = now();

  insert into public.audit_logs (actor_id, action, target_user_id, module_id, metadata)
  values (
    (select auth.uid()),
    'lab.access_changed',
    target_user_id,
    target_module_id,
    jsonb_build_object(
      'access_level', access_kind,
      'is_allowed', allowed,
      'expires_at', access_expires_at
    )
  );
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_account_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_lab_access(uuid, uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text) to authenticated;
grant execute on function public.admin_set_lab_access(uuid, uuid, text, boolean, timestamptz) to authenticated;

create or replace function public.issue_certificate_from_simulation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_module public.training_modules%rowtype;
  achieved_score numeric;
begin
  select * into selected_module
  from public.training_modules
  where slug = coalesce(
    new.module_slug,
    case new.module
      when 'Reservoir Reserves Lab' then 'reservoir-reserves'
      when 'Petroleum Economics Lab' then 'petroleum-economics'
      when 'HSE Decision Trainer' then 'hse-decision-trainer'
      else null
    end
  );

  if selected_module.id is null or not selected_module.certificate_enabled then
    return new;
  end if;

  achieved_score := case
    when selected_module.slug = 'hse-decision-trainer'
      then coalesce((new.results ->> 'percentage')::numeric, 0)
    else 100
  end;

  if achieved_score < selected_module.passing_score then
    return new;
  end if;

  insert into public.certificates (
    user_id, module_id, simulation_id, final_score, metadata
  )
  values (
    new.user_id,
    selected_module.id,
    new.id,
    achieved_score,
    jsonb_build_object('module_slug', selected_module.slug)
  )
  on conflict (user_id, module_id)
  do update set
    simulation_id = case
      when excluded.final_score >= public.certificates.final_score
        then excluded.simulation_id
      else public.certificates.simulation_id
    end,
    final_score = greatest(public.certificates.final_score, excluded.final_score),
    metadata = public.certificates.metadata || excluded.metadata;

  return new;
end;
$$;

drop trigger if exists simulation_certificate_issued on public.simulations;
create trigger simulation_certificate_issued
  after insert on public.simulations
  for each row execute procedure public.issue_certificate_from_simulation();

insert into public.certificates (
  user_id, module_id, simulation_id, final_score, metadata
)
select
  simulation.user_id,
  module.id,
  simulation.id,
  case
    when module.slug = 'hse-decision-trainer'
      and coalesce(simulation.results ->> 'percentage', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (simulation.results ->> 'percentage')::numeric
    when module.slug = 'hse-decision-trainer' then 0
    else 100
  end,
  jsonb_build_object('module_slug', module.slug, 'backfilled', true)
from public.simulations as simulation
join public.training_modules as module
  on module.slug = coalesce(
    simulation.module_slug,
    case simulation.module
      when 'Reservoir Reserves Lab' then 'reservoir-reserves'
      when 'Petroleum Economics Lab' then 'petroleum-economics'
      when 'HSE Decision Trainer' then 'hse-decision-trainer'
      else null
    end
  )
where module.certificate_enabled
  and case
    when module.slug = 'hse-decision-trainer'
      and coalesce(simulation.results ->> 'percentage', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (simulation.results ->> 'percentage')::numeric >= module.passing_score
    when module.slug = 'hse-decision-trainer' then false
    else 100 >= module.passing_score
  end
on conflict (user_id, module_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, email, display_name, full_name, phone, country, city,
    professional_status, education_area, institution, job_title
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'country', 'Moçambique'),
    new.raw_user_meta_data ->> 'city',
    coalesce(new.raw_user_meta_data ->> 'professional_status', 'student'),
    new.raw_user_meta_data ->> 'education_area',
    new.raw_user_meta_data ->> 'institution',
    new.raw_user_meta_data ->> 'job_title'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set
    email = new.email,
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute procedure public.sync_auth_user_profile();

revoke all on function public.issue_certificate_from_simulation() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;
revoke all on function public.set_training_module_updated_at() from public, anon, authenticated;

revoke update on table public.profiles from authenticated;
grant update (
  display_name, full_name, phone, country, city, professional_status,
  education_area, institution, job_title, bio, updated_at
) on table public.profiles to authenticated;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id and (select public.is_active_user()))
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read own simulations" on public.simulations;
create policy "Users can read own simulations"
  on public.simulations for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_active_user()));

drop policy if exists "Users can create own simulations" on public.simulations;
create policy "Users can create own simulations"
  on public.simulations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and module_slug is not null
    and (select public.can_access_lab(module_slug))
  );

drop policy if exists "Users can delete own simulations" on public.simulations;
create policy "Users can delete own simulations"
  on public.simulations for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_active_user()));

drop policy if exists "Published modules are visible" on public.training_modules;
drop policy if exists "Accessible modules are visible" on public.training_modules;
create policy "Accessible modules are visible"
  on public.training_modules for select to authenticated
  using ((select public.can_access_lab(slug)));

drop policy if exists "Users can read own laboratory access" on public.lab_access_grants;
create policy "Users can read own laboratory access"
  on public.lab_access_grants for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_active_user()));

drop policy if exists "Admins can read laboratory access" on public.lab_access_grants;
create policy "Admins can read laboratory access"
  on public.lab_access_grants for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can create laboratory access" on public.lab_access_grants;
create policy "Admins can create laboratory access"
  on public.lab_access_grants for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update laboratory access" on public.lab_access_grants;
create policy "Admins can update laboratory access"
  on public.lab_access_grants for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete laboratory access" on public.lab_access_grants;
create policy "Admins can delete laboratory access"
  on public.lab_access_grants for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "Users can read own certificates" on public.certificates;
create policy "Users can read own certificates"
  on public.certificates for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_active_user()));

drop policy if exists "Admins can read all certificates" on public.certificates;
create policy "Admins can read all certificates"
  on public.certificates for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read audit logs" on public.audit_logs;
create policy "Admins can read audit logs"
  on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
