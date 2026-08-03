-- Связь Telegram-чата с пользователем Науз + состояние диалога бота.
create table public.telegram_links (
  chat_id bigint primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  pending_email text,
  state text not null default 'awaiting_email'
    check (state in ('awaiting_email', 'awaiting_otp', 'awaiting_voice_label', 'idle')),
  pending_voice_id uuid references public.voices(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;
-- Без policy: доступ только через service-role клиент из вебхука бота,
-- ни anon, ни authenticated не должны видеть чужие chat_id ↔ user_id.
