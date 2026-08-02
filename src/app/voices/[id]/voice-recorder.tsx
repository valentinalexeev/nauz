"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const RECORDING_SECONDS = 30;

const HINT_TEXT = `Лиса и Журавль (отрывок)

Подружились однажды Лиса и Журавль. Позвала Лиса Журавля в гости и размазала кашу по плоской тарелке. Журавль стучал носом, стучал — ни крошки не поймал! А Лиса тем временем всё сама вылизала.

«Не обессудь, любезный, — говорит, — угостить-то больше нечем!»

Обиделся Журавль, но виду не подал. «Спасибо и на этом», — ответил он, а сам задумал: «Ну, погоди же, кума!»`;

type RecorderState = "idle" | "recording" | "recorded" | "uploading";

export function VoiceRecorder({ voiceId }: { voiceId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RecorderState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(RECORDING_SECONDS);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
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
    formData.append("audio", audioBlobRef.current, "sample.webm");

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
        <button
          onClick={startRecording}
          className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors"
        >
          Записать (30 сек)
        </button>
      )}

      {state === "recording" && (
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
