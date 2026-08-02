"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function NewVoicePage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const { redirectUrl } = (await res.json()) as { redirectUrl: string };
    router.push(redirectUrl);
  }

  return (
    <main className="flex-1 max-w-lg w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Новый голос</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm">
          Как назвать этот голос?
          <input
            required
            placeholder="Мама, Дедушка Игорь..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          />
        </label>

        <div className="rounded-lg bg-neutral-100 px-4 py-4 text-sm text-neutral-600 flex flex-col gap-3">
          <p>
            Образец голоса и запись согласия загружаются на следующем шаге,
            после подтверждения личности через KYC-сервис — это нужно,
            чтобы клонировать можно было только собственный голос или голос
            родственника, давшего явное согласие.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Я подтверждаю, что это мой голос или голос человека, который
              дал согласие на его использование в Науз.
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-50"
        >
          {submitting ? "Создаём..." : "Продолжить к подтверждению личности"}
        </button>
      </form>
    </main>
  );
}
