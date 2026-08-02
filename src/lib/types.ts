// Общие доменные типы проекта "Науз"

export type KycStatus = "not_started" | "pending" | "approved" | "rejected";

export type VoiceStatus =
  | "awaiting_kyc" // образец загружен, ждём подтверждения личности
  | "kyc_approved" // KYC пройден, можно клонировать голос
  | "cloning" // идёт создание голосового слепка в ElevenLabs
  | "ready" // голос готов к использованию
  | "failed"
  | "revoked"; // пользователь отозвал согласие / доступ заблокирован

export interface Profile {
  id: string; // = auth.users.id
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface Voice {
  id: string;
  ownerId: string; // profile.id, кто загрузил голос
  label: string; // например "Мама", "Дедушка Игорь"
  status: VoiceStatus;
  elevenlabsVoiceId: string | null;
  consentGivenAt: string | null;
  kycVerificationId: string | null;
  createdAt: string;
}

export interface KycVerification {
  id: string;
  voiceId: string;
  userId: string;
  provider: string; // имя внешнего KYC-провайдера
  externalReferenceId: string | null;
  status: KycStatus;
  createdAt: string;
  updatedAt: string;
}

export type StoryKind = "fairy_tale" | "letter";

export interface Story {
  id: string;
  ownerId: string;
  kind: StoryKind;
  title: string;
  text: string;
  templateId: string | null; // шаблон-источник для fairy_tale, null для letter
  createdAt: string;
}

// Готовый текст сказки: text_plain — для отображения пользователю,
// text_marked — с разметкой ElevenLabs (интонационные теги, ударения),
// отправляется в TTS вместо text_plain.
export interface StoryTemplate {
  id: string;
  title: string;
  language: string; // ISO 639-1, например "ru"
  textPlain: string;
  textMarked: string;
  createdAt: string;
}

export type AudioGenerationStatus = "queued" | "processing" | "ready" | "failed";

export interface AudioGeneration {
  id: string;
  storyId: string;
  voiceId: string;
  status: AudioGenerationStatus;
  audioUrl: string | null;
  watermarkId: string | null;
  createdAt: string;
}
