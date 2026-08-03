"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { MicSelector } from "@/components/audio/mic-selector";

const RECORDING_SECONDS = 60;

// Несколько разных по тону и ритму текстов вместо одного — ElevenLabs
// клонирует голос увереннее по нескольким разнообразным образцам, чем по
// одной длинной ровной записи (см. remove_background_noise в
// src/lib/elevenlabs/client.ts — та же логика "качество образца важнее").
const TEXTS: { title: string; body: string }[] = [
  {
    title: "Лиса и Журавль",
    body: `Подружились однажды Лиса и Журавль. Вот и вздумала Лиса угостить Журавля, пошла звать его к себе в гости:
— Приходи, куманёк, приходи, дорогой! Уж как я тебя угощу!

Пришёл Журавль на званый обед. А Лиса наварила манной каши и размазала по тарелке. Подаёт и потчует:
— Покушай, голубчик-куманёк, сама стряпала!

Журавль стучал-стучал носом по тарелке — ни крошки не поймал. А Лиса лижет себе да лижет кашу, пока всю сама не съела.

Каша съедена. Лиса и говорит:
— Не обессудь, любезный куманёк! Больше потчевать нечем.
— Спасибо, кума, и на этом, — отвечает Журавль. — Приходи же ты теперь ко мне в гости!

На другой день приходит Лиса, а Журавль приготовил окрошку, налил в кувшин с узким горлышком и поставил на стол:
— Кушай, кумушка! Право, больше нечем угостить.

Вертелась, вертелась Лиса вокруг кувшина — и так зайдёт, и этак, и лизнёт его, и понюхает, а достать никак не может! Не лезет голова в кувшин. А Журавль клюёт себе да клюёт, пока всё не съел.

С тех пор и дружба у Лисы с Журавлём врозь!`,
  },
  {
    title: "Вечерний разговор",
    body: `Знаешь, а ведь вечер — моё любимое время. Все дела сделаны, чайник уже закипает, а за окном тихо темнеет небо. Можно наконец сесть в старое кресло, укутаться в плед и никуда не спешить.

Я часто вспоминаю, как в детстве меня укладывали спать и рассказывали одну и ту же сказку — но каждый раз она звучала немного по-другому. То медленнее, то с новыми подробностями. И почему-то от этого становилось особенно спокойно.

Пусть и у тебя сегодняшний вечер будет таким же тихим и тёплым. Закрывай глазки, я побуду рядом.`,
  },
  {
    title: "Куда пропал Рыжик?",
    body: `Ты не поверишь, что сегодня случилось! Наш кот Рыжик исчез прямо посреди дня — только что сидел на подоконнике, и вдруг его нигде нет! Мы искали его под диваном, в шкафу, даже на балконе — и что ты думаешь?

Оказалось, он всё это время спал в корзине с чистым бельём! Представляешь, там же тепло и мягко — ну кто бы отказался вздремнуть в такой берлоге? Вот хитрец, а мы чуть с ума не сошли, пока его искали!

Интересно, что он придумает завтра?`,
  },
  {
    title: "Утро в деревне",
    body: `Солнце поднимается медленно, будто нехотя выбирается из-за дальнего леса. Сначала светлеет край неба, потом розовеют облака, а затем первый луч касается верхушек деревьев.

В такое утро особенно хорошо просто постоять на крыльце, вдохнуть прохладный воздух и послушать, как просыпается округа: где-то далеко лает собака, скрипит калитка, поёт первая птица. Роса на траве ещё не высохла, и каждый шаг оставляет на ней тёмный след.

Так начинается новый день — неспешно, спокойно, будто впереди ещё очень много времени.`,
  },
  {
    title: "Считалочка про грибы",
    body: `Раз грибок, два грибок, вот и полный кузовок. Этот — белый, этот — рыжий, этот — самый-самый ближний. Мухомор трогать не будем, он не для еды, а для красоты!

Кто нашёл последний гриб — тот сегодня и не спит, кузовок домой несёт, вечером всех грибами угощает — вкусный будет ужин, друзья, обязательно приходите!`,
  },
];

type RecorderState = "idle" | "recording" | "recorded" | "uploading";

// Safari (WebKit) не поддерживает контейнер WebM в MediaRecorder и пишет
// в MP4/AAC — если жёстко подписать Blob как audio/webm, <audio> получит
// байты одного формата с ярлыком другого и не сможет их декодировать.
// Поэтому выбираем реально поддерживаемый тип и используем его и для
// Blob, и для имени файла при отправке.
const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/mpeg",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

// "1 образец" / "2 образца" / "5 образцов" — обычное "=== 1 ? ... : ..." даёт
// неверное "5 образца" вместо "5 образцов".
function pluralizeSamples(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "образец";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "образца";
  return "образцов";
}

export function VoiceRecorder({ voiceId }: { voiceId: string }) {
  const router = useRouter();
  const [textIndex, setTextIndex] = useState(0);
  const [state, setState] = useState<RecorderState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(RECORDING_SECONDS);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [takesCount, setTakesCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [waveformError, setWaveformError] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Порядковый номер следующего дубля для загрузки (уже принятые дубли
  // сразу уходят на сервер — см. uploadTake, локально Blob'ы не копятся).
  const nextTakeIndexRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    setWaveformError(false);
    try {
      // Отключаем шумоподавление/автоусиление/эхоподавление: браузер по
      // умолчанию агрессивно чистит сигнал с микрофона, что искажает тембр
      // голоса и заметно ухудшает качество клонирования в ElevenLabs.
      // Этот же поток передаётся в LiveWaveform (см. JSX ниже) для
      // визуализации — раньше компонент сам открывал ВТОРОЙ getUserMedia,
      // и на части оборудования второй запрос к тому же микрофону падал
      // с NotReadableError ("устройство уже используется"), из-за чего
      // визуализация молча не появлялась.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      mimeTypeRef.current = mimeType ?? "audio/webm";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // recorder.mimeType — фактический тип, который выбрал браузер;
        // может отличаться от запрошенного, если тот не поддержан.
        const actualType = recorder.mimeType || mimeTypeRef.current;
        mimeTypeRef.current = actualType;
        const blob = new Blob(chunksRef.current, { type: actualType });
        audioBlobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setState("recorded");
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setSecondsLeft(RECORDING_SECONDS);

      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError(
        "Не удалось получить доступ к микрофону. Проверьте разрешения браузера.",
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  function retry() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlobRef.current = null;
    setAudioUrl(null);
    setState("idle");
  }

  // Каждый дубль грузится отдельным запросом сразу после записи — тело
  // запроса к Vercel-функциям ограничено ~4.5MB, несколько образцов разом
  // в одном запросе легко превышают лимит (см. clone-sample.ts).
  async function uploadTake(blob: Blob): Promise<boolean> {
    const index = nextTakeIndexRef.current;
    const ext = extensionForMimeType(blob.type || mimeTypeRef.current);
    const formData = new FormData();
    formData.append("audio", blob, `sample-${index}.${ext}`);
    formData.append("index", String(index));

    const res = await fetch(`/api/voices/${voiceId}/clone/sample`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось загрузить образец");
      return false;
    }

    nextTakeIndexRef.current += 1;
    setTakesCount(nextTakeIndexRef.current);
    return true;
  }

  async function acceptTake() {
    if (!audioBlobRef.current) return;
    setState("uploading");
    setError(null);

    const ok = await uploadTake(audioBlobRef.current);
    if (!ok) {
      setState("recorded");
      return;
    }

    audioBlobRef.current = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setTextIndex((i) => Math.min(i + 1, TEXTS.length - 1));
    setState("idle");
  }

  async function acceptAndSubmit() {
    setState("uploading");
    setError(null);

    if (audioBlobRef.current) {
      const ok = await uploadTake(audioBlobRef.current);
      if (!ok) {
        setState("recorded");
        return;
      }
      audioBlobRef.current = null;
    }

    await finalize();
  }

  async function finalize() {
    setState("uploading");
    setError(null);

    const res = await fetch(`/api/voices/${voiceId}/clone`, { method: "POST" });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось завершить клонирование");
      setState(audioUrl ? "recorded" : "idle");
      return;
    }

    router.refresh();
  }

  const currentText = TEXTS[textIndex];
  const isLastText = textIndex === TEXTS.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-neutral-500">
          Текст {textIndex + 1} из {TEXTS.length}
          {takesCount > 0 &&
            ` — записано образцов: ${takesCount}`}
        </p>
        <div className="rounded-lg bg-neutral-100 px-4 py-4 text-sm text-neutral-700 whitespace-pre-line">
          <p className="mb-2 font-medium text-neutral-900">{currentText.title}</p>
          {currentText.body}
        </div>
      </div>

      {state === "idle" && (
        <div className="flex flex-col gap-4">
          <MicSelector value={deviceId} onValueChange={setDeviceId} />
          <div className="flex items-center gap-3">
            <button
              onClick={startRecording}
              className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors w-fit"
            >
              Записать этот текст ({RECORDING_SECONDS} сек)
            </button>
            {takesCount > 0 && (
              <button
                onClick={finalize}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-900 transition-colors"
              >
                Хватит, отправить {takesCount}{" "}
                {pluralizeSamples(takesCount)}
              </button>
            )}
          </div>
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-neutral-100 px-3 py-2">
            {waveformError ? (
              <p className="py-3 text-center text-xs text-neutral-400">
                Запись идёт, визуализация недоступна
              </p>
            ) : (
              <LiveWaveform
                active
                stream={streamRef.current ?? undefined}
                deviceId={deviceId}
                mode="scrolling"
                height={48}
                barColor="#171717"
                // Поток записи идёт без autoGainControl (нужно для качества
                // клонирования — см. комментарий в startRecording), поэтому
                // на обычном расстоянии от микрофона сигнал заметно тише,
                // чем при включённом AGC. sensitivity компенсирует это
                // визуально, не затрагивая сам записываемый звук.
                sensitivity={3}
                onError={() => setWaveformError(true)}
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm text-neutral-600">
              Идёт запись... осталось {secondsLeft} сек
            </span>
            <button
              onClick={stopRecording}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-900 transition-colors"
            >
              Стоп
            </button>
          </div>
        </div>
      )}

      {state === "uploading" && !audioUrl && (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg bg-neutral-100 px-3 py-2">
            <LiveWaveform processing mode="scrolling" height={48} barColor="#171717" />
          </div>
          <p className="text-sm text-neutral-500">Отправляем...</p>
        </div>
      )}

      {(state === "recorded" || state === "uploading") && audioUrl && (
        <div className="flex flex-col gap-4">
          <audio controls src={audioUrl} className="w-full" />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={retry}
              disabled={state === "uploading"}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-900 transition-colors disabled:opacity-50"
            >
              Записать заново
            </button>
            {!isLastText && (
              <button
                onClick={acceptTake}
                disabled={state === "uploading"}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-900 transition-colors disabled:opacity-50"
              >
                Принять и следующий текст
              </button>
            )}
            <button
              onClick={acceptAndSubmit}
              disabled={state === "uploading"}
              className="rounded-full bg-neutral-900 text-white px-6 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {state === "uploading"
                ? "Отправляем..."
                : isLastText
                  ? "Принять и отправить"
                  : "Принять и отправить сейчас"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
