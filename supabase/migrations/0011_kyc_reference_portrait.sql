-- Референсный портрет из первой одобренной KYC-верификации пользователя —
-- нужен для лёгкой биометрической переверификации (liveness + face-match
-- через Didit biometric_authentication) при создании последующих голосов
-- тем же пользователем, без повторного скана документа.
alter table public.profiles add column if not exists kyc_reference_portrait_path text;

insert into storage.buckets (id, name, public)
values ('kyc-portraits', 'kyc-portraits', false)
on conflict (id) do nothing;

-- Приватный бакет: доступ только через service-role на сервере (это
-- биометрические данные) — политик для клиента намеренно нет.
