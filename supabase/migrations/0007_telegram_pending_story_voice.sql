-- Отдельное поле для голоса, выбранного в шаге "выбор сказки" бота —
-- pending_voice_id уже занят под ожидание образца при клонировании,
-- переиспользование привело бы к путанице между двумя разными флоу.
alter table public.telegram_links
  add column pending_story_voice_id uuid references public.voices(id);
