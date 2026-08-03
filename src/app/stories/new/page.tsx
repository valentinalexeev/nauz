"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Voice, StoryKind, StoryTemplate } from "@/lib/types";
import { SPEED_OPTIONS } from "@/lib/stories/speed-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
          <div className="flex flex-col gap-2">
            <Label htmlFor="voice-select">Чьим голосом озвучить?</Label>
            <Select
              id="voice-select"
              required
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              <option value="" disabled>
                Выберите голос
              </option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>

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
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-select">Какую сказку озвучить?</Label>
                <Select
                  id="template-select"
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="" disabled>
                    Выберите сказку
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </div>
            )
          ) : (
            <>
              <Input
                required
                placeholder="Название"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <Textarea
                required
                rows={10}
                placeholder="Текст письма..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="speed-select">Скорость речи</Label>
            <Select
              id="speed-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={submitting || !canSubmit} className="rounded-full w-fit">
            {submitting ? "Создаём аудио..." : "Создать запись"}
          </Button>
        </form>
      )}
    </main>
  );
}
