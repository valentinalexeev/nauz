-- Отдельные поля для книги и голоса, выбранных в flow бота "/books" —
-- та же причина, что и с pending_story_voice_id/pending_story_template_id:
-- callback_data Telegram ограничен 64 байтами, два UUID вместе не влезают,
-- поэтому промежуточный выбор хранится в telegram_links, а в кнопке
-- остаётся только один короткий id.
alter table public.telegram_links
  add column pending_book_id uuid references public.books(id),
  add column pending_book_voice_id uuid references public.voices(id);
