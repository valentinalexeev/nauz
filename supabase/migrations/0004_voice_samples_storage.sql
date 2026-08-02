-- Хранилище сырых образцов голоса, переданных в ElevenLabs для клонирования
alter table public.voices add column if not exists sample_audio_path text;

insert into storage.buckets (id, name, public)
values ('voice-samples', 'voice-samples', false)
on conflict (id) do nothing;

create policy "voice samples: owner can read own files"
  on storage.objects for select
  using (
    bucket_id = 'voice-samples'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
