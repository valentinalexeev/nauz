"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Voice, StoryKind, StoryTemplate } from "@/lib/types";
import { SPEED_OPTIONS } from "@/lib/stories/speed-options";

export default function NewStoryPage() {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [kind, setKind] = useState<StoryKind>("fairy_tale");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("voices")
      .select("*")
      .eq("status", "ready")
      .then(({ data }) => setVoices((data as Voice[]) ?? []));
    supabase
      .from("story_templates")
      .select("*")
      .order("title", { ascending: true })
      .then(({ data }) => setTemplates((data as StoryTemplate[]) ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body =
      kind === "fairy_tale"
        ? { voiceId, kind, templateId, speed }
        : { voiceId, kind, title, text, speed };

    const res = await fetch("/api/stories/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError("Не удалось создать запись");
      setSubmitting(false);
      return;
    }

    const { storyId } = (await res.json()) as { storyId: string };
    router.push(`/stories/${storyId}`);
  }

  const canSubmit =
    voiceId && (kind === "fairy_tale" ? templateId : title && text);

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Новая сказка или письмо</h1>

      {voices.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Сначала нужен хотя бы один готовый голос —{" "}
          <a href="/voices/new" className="underline">
            добавьте его здесь
          </a>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm">
            Чьим голосом озвучить?
            <select
              required
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
            >
              <option value="" disabled>
                Выберите голос
              </option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={kind === "fairy_tale"}
                onChange={() => setKind("fairy_tale")}
              />
              Сказка
            </label>
            <label className="flex items-center gap-2 text-neutral-400 cursor-not-allowed">
              <input type="radio" checked={false} disabled />
              Письмо <span className="text-xs">(скоро)</span>
            </label>
          </div>

          {kind === "fairy_tale" ? (
            templates.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Пока нет ни одной готовой сказки.
              </p>
            ) : (
              <label className="flex flex-col gap-2 text-sm">
                Какую сказку озвучить?
                <select
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
                >
                  <option value="" disabled>
                    Выберите сказку
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <>
              <input
                required
                placeholder="Название"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
              />

              <textarea
                required
                rows={10}
                placeholder="Текст письма..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
              />
            </>
          )}

          <label className="flex flex-col gap-2 text-sm">
            Скорость речи
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Создаём аудио..." : "Создать запись"}
          </button>
        </form>
      )}
    </main>
  );
}
