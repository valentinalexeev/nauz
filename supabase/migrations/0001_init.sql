-- Науз: базовая схема БД
-- Все таблицы защищены Row Level Security: пользователь видит и меняет
-- только свои собственные записи. Служебные операции (KYC-вебхуки,
-- запись результата клонирования голоса и т.п.) выполняются через
-- service-role ключ на сервере, который обходит RLS.

create extension if not exists "pgcrypto";

-- Профиль пользователя (1:1 с auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: user can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: user can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Голосовые профили
create table if not exists public.voices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  status text not null default 'awaiting_kyc'
    check (status in ('awaiting_kyc', 'kyc_approved', 'cloning', 'ready', 'failed', 'revoked')),
  elevenlabs_voice_id text,
  consent_given_at timestamptz,
  kyc_verification_id uuid,
  created_at timestamptz not null default now()
);

alter table public.voices enable row level security;

create policy "voices: owner can read"
  on public.voices for select
  using (auth.uid() = owner_id);

create policy "voices: owner can insert"
  on public.voices for insert
  with check (auth.uid() = owner_id);

create policy "voices: owner can update own (limited fields client-side)"
  on public.voices for update
  using (auth.uid() = owner_id);

-- KYC-проверки, привязанные к голосовому профилю
create table if not exists public.kyc_verifications (
  id uuid primary key default gen_random_uuid(),
  voice_id uuid not null references public.voices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  external_reference_id text,
  status text not null default 'pending'
    check (status in ('not_started', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kyc_verifications enable row level security;

create policy "kyc: owner can read own verifications"
  on public.kyc_verifications for select
  using (auth.uid() = user_id);

-- Записи (сказки/письма)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('fairy_tale', 'letter')),
  title text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

create policy "stories: owner can read"
  on public.stories for select
  using (auth.uid() = owner_id);

create policy "stories: owner can insert"
  on public.stories for insert
  with check (auth.uid() = owner_id);

create policy "stories: owner can update"
  on public.stories for update
  using (auth.uid() = owner_id);

create policy "stories: owner can delete"
  on public.stories for delete
  using (auth.uid() = owner_id);

-- Сгенерированные аудиозаписи
create table if not exists public.audio_generations (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  voice_id uuid not null references public.voices (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  audio_url text,
  watermark_id text,
  created_at timestamptz not null default now()
);

alter table public.audio_generations enable row level security;

create policy "audio_generations: owner can read"
  on public.audio_generations for select
  using (auth.uid() = owner_id);

create policy "audio_generations: owner can insert"
  on public.audio_generations for insert
  with check (auth.uid() = owner_id);

-- Автосоздание профиля при регистрации пользователя
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Хранилище аудиофайлов
insert into storage.buckets (id, name, public)
values ('audio-generations', 'audio-generations', false)
on conflict (id) do nothing;

create policy "audio storage: owner can read own files"
  on storage.objects for select
  using (
    bucket_id = 'audio-generations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
