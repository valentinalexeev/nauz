-- Recap-вопросы теперь отдельный аудиофайл от самой главы (а не склеены в
-- один mp3) — это даёт реальную паузу между ними на плеере: пользователь
-- может остановиться на любое время, а не просто дождаться склеенной
-- переходной фразы. recap_audio_url — null, если вопросы отключили при
-- генерации (see includeRecap в generateChapterAudio) или их не было
-- (первая глава книги). recap_delay_seconds — сколько ждать после recap
-- перед автопродолжением главы (0 — сразу, без паузы).
alter table public.book_chapter_generations
  add column recap_audio_url text,
  add column recap_delay_seconds int not null default 5;
