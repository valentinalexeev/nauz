import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice, KycStatus } from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <AppShell active="voices" userEmail={user?.email ?? null}>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-3xl font-medium text-ink">
            {(voice as Voice).label}
          </h1>
          {voice.status !== "revoked" && (
            <RenameVoiceButton voiceId={voice.id} currentLabel={(voice as Voice).label} />
          )}
        </div>
      </div>

      <VoiceStatusPanel voice={voice as Voice} kycStatus={kycStatus} />
    </AppShell>
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-clay" />
            </span>
            <p className="text-sm text-ink-soft">
              Статус проверки личности: {kycStatusLabel(kycStatus ?? "pending")}
            </p>
          </div>
          <p className="text-sm text-ink-soft">
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-clay" />
            </span>
            <p className="text-sm text-ink-soft">Создаём голос из вашего образца...</p>
          </div>
          <p className="text-sm text-ink-soft">
            Это может занять минуту-другую, страница обновляется автоматически.
          </p>
          <AutoRefresh />
        </div>
      );
    case "ready":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">Голос готов к использованию.</p>
          <Link
            href="/stories/new"
            className="w-fit rounded-lg bg-clay px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-clay-hover"
          >
            Создать сказку этим голосом
          </Link>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-destructive">
            Не удалось создать голос из прошлой попытки. Можно записать
            образец ещё раз.
          </p>
          <VoiceRecorder voiceId={voice.id} />
        </div>
      );
    case "revoked":
      return (
        <p className="text-sm text-ink-soft">
          Этот голос удалён. Записи, сделанные им ранее, остаются доступны.
        </p>
      );
  }
}
