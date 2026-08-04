"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewVoicePage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // KYC проходится один раз на человека (см. startKycForVoice) — если у
  // пользователя уже есть одобренная верификация, шага подтверждения
  // личности для нового голоса не будет, сразу переходим к записи.
  // null, пока не узнали точно — до ответа считаем как обычно (KYC нужен),
  // это самое частое и безопасное умолчание для первого голоса.
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("kyc_verifications")
      .select("id")
      .eq("status", "approved")
      .limit(1)
      .then(({ data }) => setAlreadyVerified(Boolean(data?.length)));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Нужно подтвердить согласие на использование голоса.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: voice, error: insertError } = await supabase
      .from("voices")
      .insert({
        owner_id: user.id,
        label,
        status: "awaiting_kyc",
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !voice) {
      setError(insertError?.message ?? "Не удалось создать голосовой профиль");
      setSubmitting(false);
      return;
    }

    // Запускаем KYC-верификацию для этого голоса
    const res = await fetch("/api/kyc/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: voice.id }),
    });

    if (!res.ok) {
      setError("Не удалось запустить подтверждение личности");
      setSubmitting(false);
      return;
    }

    const { redirectUrl } = (await res.json()) as { redirectUrl: string | null };
    // null — личность уже подтверждена ранее, KYC для этого голоса не нужен
    router.push(redirectUrl ?? `/voices/${voice.id}`);
  }

  return (
    <>
      <div className="text-[13px] font-bold tracking-wide text-clay uppercase">
        Шаг 1 из 3 · Голос
      </div>
      <div>
        <h1 className="mb-4 font-serif text-3xl font-medium text-ink">
          Прежде чем сохранить голос
        </h1>
        <p className="max-w-lg text-[15px] leading-relaxed text-ink-soft">
          Голос — часть личности. Мы клонируем его только с вашего явного
          согласия и после подтверждения, что это действительно вы.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="voice-label">Как назвать этот голос?</Label>
          <Input
            id="voice-label"
            required
            placeholder="Мама, Дедушка Игорь..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-3 rounded-xl bg-surface px-5 py-4 text-sm leading-relaxed text-ink">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 accent-clay"
          />
          <span>
            Это мой собственный голос, и я даю согласие на его использование
            в Науз — или голос человека, который дал такое согласие сам.
          </span>
        </label>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-ink">Подтверждение личности</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              {alreadyVerified
                ? "Уже подтверждено раньше — на следующем шаге сразу запись голоса."
                : "Чтобы никто не мог создать голос за другого человека"}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-fit">
          {submitting
            ? "Создаём..."
            : alreadyVerified
              ? "Продолжить к записи голоса"
              : "Продолжить к подтверждению личности"}
        </Button>
      </form>
    </>
  );
}
