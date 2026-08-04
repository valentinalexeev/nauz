import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice, KycStatus } from "@/lib/types";
import { VoiceRecorder } from "./voice-recorder";
import { AutoRefresh } from "./auto-refresh";
import { RenameVoiceButton } from "@/components/voice/rename-voice-button";

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

  let kycStatus: KycStatus | null = null;
  if (voice.status === "awaiting_kyc") {
    const { data: verification } = await supabase
      .from("kyc_verifications")
      .select("status")
      .eq("voice_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    kycStatus = verification?.status ?? null;
  }

  return (
    <main className="flex-1 max-w-lg w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{(voice as Voice).label}</h1>
          {voice.status !== "revoked" && (
            <RenameVoiceButton voiceId={voice.id} currentLabel={(voice as Voice).label} />
          )}
        </div>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← назад в дашборд
        </Link>
      </div>

      <VoiceStatusPanel voice={voice as Voice} kycStatus={kycStatus} />
    </main>
  );
}

function kycStatusLabel(status: KycStatus): string {
  switch (status) {
    case "not_started":
      return "не начата";
    case "pending":
      return "в процессе";
    case "approved":
      return "подтверждена";
    case "rejected":
      return "отклонена";
  }
}

function VoiceStatusPanel({
  voice,
  kycStatus,
}: {
  voice: Voice;
  kycStatus: KycStatus | null;
}) {
  switch (voice.status) {
    case "awaiting_kyc":
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-500" />
            </span>
            <p className="text-sm text-neutral-600">
              Статус проверки личности: {kycStatusLabel(kycStatus ?? "pending")}
            </p>
          </div>
          <p className="text-sm text-neutral-500">
            Как только KYC-проверка пройдёт, здесь появится возможность
            записать образец голоса. Страница обновляется автоматически.
          </p>
          <AutoRefresh />
        </div>
      );
    case "kyc_approved":
      return <VoiceRecorder voiceId={voice.id} />;
    case "cloning":
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-500" />
            </span>
            <p className="text-sm text-neutral-600">
              Создаём голос из вашего образца...
            </p>
          </div>
          <p className="text-sm text-neutral-500">
            Это может занять минуту-другую, страница обновляется автоматически.
          </p>
          <AutoRefresh />
        </div>
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
          Этот голос удалён. Записи, сделанные им ранее, остаются доступны.
        </p>
      );
  }
}
