-- Публичная ссылка на плеер сказки — чтобы ребёнок мог включить запись
-- без авторизации. Токен генерируется сразу для всех существующих и
-- будущих записей (volatile default -> отдельное значение на каждую
-- строку), непредсказуем (16 случайных байт), доступ по нему отдаём
-- только через service-role на сервере (см. /s/[token]) — RLS-политика
-- клиенту не нужна.
alter table public.stories
  add column if not exists share_token text
  default encode(gen_random_bytes(16), 'hex');

update public.stories set share_token = encode(gen_random_bytes(16), 'hex')
  where share_token is null;

alter table public.stories alter column share_token set not null;
alter table public.stories add constraint stories_share_token_key unique (share_token);
