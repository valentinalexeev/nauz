import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice } from "@/lib/types";
import { VoiceRecorder } from "./voice-recorder";

export default async function VoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: voice } = await supabase
    .from("voices")
    .select("*")
    .eq("id", id)
    .single();

  if (!voice) notFound();

  return (
    <main className="flex-1 max-w-lg w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{(voice as Voice).label}</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← назад в дашборд
        </Link>
      </div>

      <VoiceStatusPanel voice={voice as Voice} />
    </main>
  );
}

function VoiceStatusPanel({ voice }: { voice: Voice }) {
  switch (voice.status) {
    case "awaiting_kyc":
      return (
        <p className="text-sm text-neutral-600">
          Ожидает подтверждения личности. Как только KYC-проверка пройдёт,
          здесь появится возможность записать образец голоса.
        </p>
      );
    case "kyc_approved":
      return <VoiceRecorder voiceId={voice.id} />;
    case "cloning":
      return (
        <p className="text-sm text-neutral-600">
          Создаём голос из вашего образца... Это может занять минуту-другую,
          обновите страницу, чтобы проверить статус.
        </p>
      );
    case "ready":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            Голос готов к использованию.
          </p>
          <Link
            href="/stories/new"
            className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors w-fit"
          >
            Создать сказку этим голосом
          </Link>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-red-600">
            Не удалось создать голос из прошлой попытки. Можно записать
            образец ещё раз.
          </p>
          <VoiceRecorder voiceId={voice.id} />
        </div>
      );
    case "revoked":
      return (
        <p className="text-sm text-neutral-600">
          Доступ к этому голосу отозван.
        </p>
      );
  }
}
