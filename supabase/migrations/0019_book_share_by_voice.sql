-- books.share_token (миграция 0018) был привязан к книге целиком, а не к
-- конкретному чтению — на /b/[token] выбиралась "самая свежая готовая
-- генерация любым голосом" по каждой главе. Одну и ту же книгу могут
-- читать голоса разных пользователей, поэтому такая ссылка могла в любой
-- момент внезапно начать показывать чужую запись вместо своей (утечка
-- чужого голоса без согласия). Правильная единица — пара (книга, голос):
-- голос уже принадлежит конкретному владельцу.
alter table public.books drop column if exists share_token;

create table public.book_share_links (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  voice_id uuid not null references public.voices(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  share_token text not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique (book_id, voice_id),
  unique (share_token)
);

alter table public.book_share_links enable row level security;

create policy "book_share_links: owner can read own"
  on public.book_share_links for select
  using (auth.uid() = owner_id);

create policy "book_share_links: owner can insert own"
  on public.book_share_links for insert
  with check (auth.uid() = owner_id);
