# Науз

Сказки и письма для детей, озвученные голосами их родителей и близких —
с ИИ-клонированием голоса, подтверждением права на его использование
(KYC) и защитой от несанкционированного повторного использования
голосового слепка через водяной знак в аудио.

Идея сервиса и происхождение названия — в [`docs/overview.md`](./docs/overview.md).

## Стек

- **Next.js 16** (App Router, TypeScript 7) — веб-приложение, хостится на **Vercel**.
  Все зависимости зафиксированы на актуальных версиях на момент инициализации проекта.
  > Известное ограничение: `typescript-eslint` (используется в `eslint-config-next`)
  > пока не поддерживает TypeScript 7 ([трекинг-issue](https://github.com/typescript-eslint/typescript-eslint/issues/10940)),
  > поэтому `npm run lint` временно не запускается. Сборка (`npm run build`)
  > и проверка типов при этом работают штатно через `experimental.useTypeScriptCli`
  > в `next.config.ts`. Когда апстрим добавит поддержку — просто обновить
  > `typescript-eslint`/`eslint-config-next`.
- **Supabase** — база данных (Postgres + RLS), аутентификация по magic link, хранилище аудиофайлов.
- **ElevenLabs** — клонирование голоса и синтез речи.
- KYC-провайдер (подключается отдельно, см. `src/lib/kyc/provider.ts`) — подтверждение личности перед клонированием голоса.
- Водяной знак в сгенерированном аудио (`src/lib/watermark`) — защита голосового слепка от повторного использования.

## Структура проекта

```
src/
  app/
    page.tsx                  — лендинг
    login/                    — вход по magic link
    auth/callback/            — обмен кода на сессию Supabase
    dashboard/                — список голосов и записей
    voices/new/                — создание голосового профиля + запуск KYC
    voices/[id]/kyc/stub/      — заглушка KYC для локальной разработки
    stories/new/               — создание сказки/письма и генерация аудио
    stories/[id]/               — прослушивание готовой записи
    api/kyc/start/              — запуск верификации личности
    api/kyc/webhook/            — приём результата от KYC-провайдера
    api/stories/generate/       — генерация озвучки через ElevenLabs + водяной знак
  lib/
    supabase/                  — клиенты Supabase (browser/server/admin)
    elevenlabs/                — обёртка над ElevenLabs API
    kyc/                       — абстракция над KYC-провайдером
    watermark/                 — встраивание/проверка водяного знака
    types.ts                   — доменные типы
  middleware.ts                — обновление сессии, защита приватных разделов
supabase/
  migrations/0001_init.sql     — схема БД, RLS-политики, storage bucket
docs/
  overview.md                  — идея сервиса и происхождение названия
```

## Разработка

```bash
npm install
cp .env.example .env.local   # заполнить ключи Supabase / ElevenLabs / KYC
npm run dev
```

Открыть [http://localhost:3000](http://localhost:3000).

### Переменные окружения

См. `.env.example`. Обязательные для базового запуска:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ELEVENLABS_API_KEY`
- `KYC_PROVIDER` (по умолчанию `stub` — тестовая заглушка без реальной проверки личности)

### База данных

Применить миграцию на проект Supabase:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Миграция создаёт таблицы `profiles`, `voices`, `kyc_verifications`, `stories`,
`audio_generations`, включает RLS на всех таблицах и приватный storage-бакет
`audio-generations`.

## Что уже реализовано, а что — точки расширения

Готово: каркас приложения, схема БД с RLS, флоу magic-link входа,
создание голосового профиля с запуском KYC-заглушки, генерация аудио
через ElevenLabs с местом для встраивания водяного знака, базовые
страницы дашборда/создания записи/прослушивания.

Требует подключения перед продакшеном:

1. **Реальный KYC-провайдер** — сейчас используется `stubKycProvider`
   (`src/lib/kyc/provider.ts`). Нужно реализовать `KycProvider` для
   выбранного сервиса (например, аналогичного beorg.ru) и подключить
   через `KYC_PROVIDER`.
2. **Реальная схема водяного знака** — сейчас `src/lib/watermark/index.ts`
   лишь генерирует и сохраняет идентификатор в БД, но не встраивает
   сигнал в аудио-поток. Нужно подключить нейросетевую watermarking-модель
   (например AudioSeal/Resemble PerTh) или собственный DSP-пайплайн.
3. **Загрузка образцов голоса** — форма `voices/new` пока не включает
   реальную загрузку аудио-файлов в ElevenLabs (`cloneVoice` в
   `src/lib/elevenlabs/client.ts` готов, но не вызывается из UI до
   прохождения KYC) — следующий шаг после подключения KYC-провайдера.

## Деплой

Проект подготовлен для деплоя на Vercel (`vercel.json` не требуется —
Next.js определяется автоматически). Переменные окружения из
`.env.example` нужно задать в настройках проекта на Vercel.
