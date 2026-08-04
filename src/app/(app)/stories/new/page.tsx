"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Voice, StoryKind } from "@/lib/types";
import { SPEED_OPTIONS } from "@/lib/stories/speed-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Supabase-клиент отдаёт строки как есть (snake_case) — доменный тип
// StoryTemplate в src/lib/types.ts camelCase и для приведения типов из
// клиентских запросов не подходит (та же причина, что и у RawBookChapter
// в book-reader.tsx), поэтому здесь отдельный "сырой" тип.
interface RawStoryTemplate {
  id: string;
  title: string;
  text_plain: string;
}

export default function NewStoryPage() {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [templates, setTemplates] = useState<RawStoryTemplate[]>([]);
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
      .select("id, title, text_plain")
      .order("title", { ascending: true })
      .then(({ data }) => setTemplates((data as RawStoryTemplate[]) ?? []));
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
  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <>
      <h1 className="font-serif text-3xl font-medium text-ink">
        Новая сказка или письмо
      </h1>

      {voices.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-soft">
          Сначала нужен хотя бы один готовый голос —{" "}
          <a href="/voices/new" className="text-clay underline">
            добавьте его здесь
          </a>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="flex gap-2">
              <TabPill active={kind === "fairy_tale"} onClick={() => setKind("fairy_tale")}>
                Из библиотеки
              </TabPill>
              <TabPill active={false} disabled>
                Своё письмо <span className="text-xs">(скоро)</span>
              </TabPill>
            </div>

            <div className="min-h-[280px] rounded-2xl bg-surface p-8">
              {kind === "fairy_tale" ? (
                templates.length === 0 ? (
                  <p className="text-sm text-ink-soft">Пока нет ни одной готовой сказки.</p>
                ) : selectedTemplate ? (
                  <p className="whitespace-pre-wrap font-serif text-[19px] leading-relaxed text-ink-soft">
                    {selectedTemplate.text_plain}
                  </p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    Выберите сказку из списка справа, чтобы увидеть текст здесь.
                  </p>
                )
              ) : (
                <div className="flex flex-col gap-4">
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
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {kind === "fairy_tale" && templates.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="template-select" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Какую сказку озвучить?
                </Label>
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
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="voice-select" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Голосом
              </Label>
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

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Скорость
              </span>
              <div className="flex flex-wrap gap-2">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSpeed(opt.value)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                      speed === opt.value
                        ? "bg-clay text-white"
                        : "border border-border text-ink-soft hover:border-clay hover:text-clay",
                    )}
                  >
                    {opt.value}×
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Создаём аудио..." : "Озвучить"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

function TabPill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "bg-clay text-white"
          : disabled
            ? "cursor-not-allowed text-ink-soft/60"
            : "text-ink-soft hover:text-clay",
      )}
    >
      {children}
    </button>
  );
}
