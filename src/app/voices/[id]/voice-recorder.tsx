"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { MicSelector } from "@/components/audio/mic-selector";

const RECORDING_SECONDS = 60;

const HINT_TEXT = `Лиса и Журавль

Подружились однажды Лиса и Журавль. Вот и вздумала Лиса угостить Журавля, пошла звать его к себе в гости:
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

С тех пор и дружба у Лисы с Журавлём врозь!`;

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

export function VoiceRecorder({ voiceId }: { voiceId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RecorderState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(RECORDING_SECONDS);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    try {
      // Отключаем шумоподавление/автоусиление/эхоподавление: браузер по
      // умолчанию агрессивно чистит сигнал с микрофона, что искажает тембр
      // голоса и заметно ухудшает качество клонирования в ElevenLabs.
      // Это отдельный поток от того, что использует LiveWaveform для
      // визуализации (там эти опции жёстко включены) — специально не
      // переиспользуем его, чтобы не портить качество записываемого сэмпла.
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

  async function submit() {
    if (!audioBlobRef.current) return;
    setState("uploading");
    setError(null);

    const formData = new FormData();
    const ext = extensionForMimeType(mimeTypeRef.current);
    formData.append("audio", audioBlobRef.current, `sample.${ext}`);

    const res = await fetch(`/api/voices/${voiceId}/clone`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось отправить образец на клонирование");
      setState("recorded");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-neutral-100 px-4 py-4 text-sm text-neutral-700 whitespace-pre-line">
        {HINT_TEXT}
      </div>

      {state === "idle" && (
        <div className="flex flex-col gap-4">
          <MicSelector value={deviceId} onValueChange={setDeviceId} />
          <button
            onClick={startRecording}
            className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors w-fit"
          >
            Записать ({RECORDING_SECONDS} сек)
          </button>
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-neutral-100 px-3 py-2">
            <LiveWaveform
              active
              deviceId={deviceId}
              mode="scrolling"
              height={48}
              barColor="var(--foreground)"
            />
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

      {(state === "recorded" || state === "uploading") && audioUrl && (
        <div className="flex flex-col gap-4">
          <audio controls src={audioUrl} className="w-full" />
          <div className="flex gap-3">
            <button
              onClick={retry}
              disabled={state === "uploading"}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-900 transition-colors disabled:opacity-50"
            >
              Записать заново
            </button>
            <button
              onClick={submit}
              disabled={state === "uploading"}
              className="rounded-full bg-neutral-900 text-white px-6 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {state === "uploading" ? "Отправляем..." : "Отправить"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
