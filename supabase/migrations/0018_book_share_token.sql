-- Публичная ссылка на книгу без авторизации — по аналогии с
-- stories.share_token (миграция 0013). Токен непредсказуем (16 случайных
-- байт), доступ по нему только через service-role на сервере (/b/[token]).
alter table public.books
  add column if not exists share_token text
  default encode(gen_random_bytes(16), 'hex');

update public.books set share_token = encode(gen_random_bytes(16), 'hex')
  where share_token is null;

alter table public.books alter column share_token set not null;
alter table public.books add constraint books_share_token_key unique (share_token);
