-- Отдельное поле для шаблона, выбранного на шаге "какая сказка", пока
-- пользователь выбирает скорость речи (третий шаг в том же флоу, что и
-- pending_story_voice_id из 0007).
alter table public.telegram_links
  add column pending_story_template_id uuid references public.story_templates(id);
