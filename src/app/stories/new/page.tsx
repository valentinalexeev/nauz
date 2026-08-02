"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Voice, StoryKind } from "@/lib/types";

export default function NewStoryPage() {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [kind, setKind] = useState<StoryKind>("fairy_tale");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("voices")
      .select("*")
      .eq("status", "ready")
      .then(({ data }) => setVoices((data as Voice[]) ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/stories/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, kind, title, text }),
    });

    if (!res.ok) {
      setError("Не удалось создать запись");
      setSubmitting(false);
      return;
    }

    const { storyId } = (await res.json()) as { storyId: string };
    router.push(`/stories/${storyId}`);
  }

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
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={kind === "letter"}
                onChange={() => setKind("letter")}
              />
              Письмо
            </label>
          </div>

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
            placeholder="Текст сказки или письма..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Создаём аудио..." : "Создать запись"}
          </button>
        </form>
      )}
    </main>
  );
}
