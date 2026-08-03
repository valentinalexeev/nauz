-- Книги по главам с вопросами-напоминалкой перед следующей главой —
-- исходная задумка "читать книги своим голосом перед сном" +
-- "вопросы по предыдущей главе". По аналогии со story_templates: текст
-- курируется только сервером, не свободный пользовательский ввод.
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  language text not null default 'ru',
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

create policy "books: authenticated can read"
  on public.books for select
  to authenticated
  using (true);

create table public.book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  order_index int not null,
  title text not null,
  text_plain text not null,
  text_marked text not null,
  -- Вопросы по ЭТОЙ главе — озвучиваются перед следующей, как "вспомним,
  -- что было". Null для последней главы книги: вспоминать после неё нечего.
  recap_questions_marked text,
  created_at timestamptz not null default now(),
  unique (book_id, order_index)
);

alter table public.book_chapters enable row level security;

create policy "book_chapters: authenticated can read"
  on public.book_chapters for select
  to authenticated
  using (true);

-- Сгенерированные аудио глав — аналог audio_generations, но привязаны к
-- главе книги, а не к самостоятельной записи (stories).
create table public.book_chapter_generations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.book_chapters(id) on delete cascade,
  voice_id uuid not null references public.voices(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  audio_url text,
  watermark_id text,
  created_at timestamptz not null default now()
);

alter table public.book_chapter_generations enable row level security;

create policy "book_chapter_generations: owner can read"
  on public.book_chapter_generations for select
  using (auth.uid() = owner_id);

create policy "book_chapter_generations: owner can insert"
  on public.book_chapter_generations for insert
  with check (auth.uid() = owner_id);
