import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseAuthClient } from "@/lib/supabase/auth";
import { startKycForVoice } from "@/lib/voices/start-kyc";
import { cloneVoiceSample } from "@/lib/voices/clone-sample";
import { generateStoryAudio } from "@/lib/stories/generate-audio";
import {
  sendMessage,
  sendAudio,
  sendChatAction,
  setMyCommands,
  answerCallbackQuery,
  getFile,
  downloadFile,
  type ChatAction,
  type InlineKeyboard,
} from "@/lib/telegram/client";
import type { Voice, VoiceStatus } from "@/lib/types";

function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL не задан");
  return url;
}

const ABOUT_NAUZ =
  "Науз записывает сказки и письма для детей голосом мамы, папы или другого близкого человека — даже когда рядом их нет. " +
  "Голос клонируется только с явного согласия и после подтверждения личности, а готовую сказку можно слушать прямо тут или на сайте.";

const BOT_COMMANDS = [
  { command: "voices", description: "🎙 Мои голоса — создать сказку" },
  { command: "newvoice", description: "➕ Записать новый голосовой слепок" },
];

const CHAT_ACTION_REFRESH_MS = 4000; // Telegram гасит статус через ~5 сек

/**
 * Держит статус "печатает…" (или другой ChatAction) в чате, пока выполняется
 * долгая операция (клонирование голоса, генерация аудио) — иначе индикатор
 * пропадает через несколько секунд и пользователь не понимает, идёт ли что-то.
 */
async function withChatAction<T>(
  chatId: number,
  action: ChatAction,
  fn: () => Promise<T>,
): Promise<T> {
  await sendChatAction({ chatId, action }).catch(() => {});
  const interval = setInterval(() => {
    sendChatAction({ chatId, action }).catch(() => {});
  }, CHAT_ACTION_REFRESH_MS);

  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Длина email-OTP в Supabase настраивается в Dashboard (Auth > Providers >
// Email > Email OTP Length) и не всегда равна 6 — у этого проекта, например,
// код из 8 цифр. Проверяем разумный диапазон, а не жёсткую длину.
const OTP_RE = /^\d{6,10}$/;

// Минимальные типы Telegram Update — нам нужны только используемые поля.
interface TelegramUser {
  id: number;
}
interface TelegramVoiceOrAudio {
  file_id: string;
  mime_type?: string;
}
interface TelegramMessage {
  chat: { id: number };
  from?: TelegramUser;
  text?: string;
  voice?: TelegramVoiceOrAudio;
  audio?: TelegramVoiceOrAudio;
}
interface TelegramCallbackQuery {
  id: string;
  message?: { chat: { id: number } };
  data?: string;
}
export interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramLink {
  chat_id: number;
  user_id: string | null;
  pending_email: string | null;
  state: "awaiting_email" | "awaiting_otp" | "awaiting_voice_label" | "idle";
  pending_voice_id: string | null;
  pending_story_voice_id: string | null;
}

async function getOrCreateLink(chatId: number): Promise<TelegramLink> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("telegram_links")
    .select("*")
    .eq("chat_id", chatId)
    .single();

  if (existing) return existing as TelegramLink;

  const { data: created } = await admin
    .from("telegram_links")
    .insert({ chat_id: chatId })
    .select()
    .single();

  return created as TelegramLink;
}

async function updateLink(chatId: number, patch: Partial<TelegramLink>) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("telegram_links")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("chat_id", chatId);
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const link = await getOrCreateLink(chatId);
  const audioAttachment = message.voice ?? message.audio;

  if (audioAttachment) {
    await handleAudioMessage(chatId, link, audioAttachment);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  if (text === "/start") {
    await setMyCommands(BOT_COMMANDS).catch(() => {});

    if (link.user_id) {
      await sendMessage({
        chatId,
        text: `${ABOUT_NAUZ}\n\nВы уже вошли. Отправьте /voices, чтобы увидеть свои голоса и создать сказку.`,
      });
    } else {
      await updateLink(chatId, { state: "awaiting_email" });
      await sendMessage({
        chatId,
        text: `${ABOUT_NAUZ}\n\nЧтобы начать, пришлите свой email — войдём или зарегистрируем новый аккаунт.`,
      });
    }
    return;
  }

  if (link.user_id && text === "/voices") {
    await listVoices(chatId, link.user_id);
    return;
  }

  if (link.user_id && text === "/newvoice") {
    await updateLink(chatId, { state: "awaiting_voice_label" });
    await sendMessage({ chatId, text: "Как назвать этот голос? (например, «Мама»)" });
    return;
  }

  switch (link.state) {
    case "awaiting_email":
      await handleEmailStep(chatId, text);
      return;
    case "awaiting_otp":
      await handleOtpStep(chatId, link, text);
      return;
    case "awaiting_voice_label":
      await handleVoiceLabelStep(chatId, link, text);
      return;
    case "idle":
      if (!link.user_id) {
        await updateLink(chatId, { state: "awaiting_email" });
        await sendMessage({ chatId, text: "Сначала войдите — пришлите свой email." });
        return;
      }
      await sendMessage({
        chatId,
        text: "Команды: /voices — ваши голоса, /newvoice — добавить новый голос.",
      });
      return;
  }
}

async function handleEmailStep(chatId: number, text: string): Promise<void> {
  if (!EMAIL_RE.test(text)) {
    await sendMessage({ chatId, text: "Это не похоже на email. Попробуйте ещё раз." });
    return;
  }

  const auth = createSupabaseAuthClient();
  const { error } = await auth.auth.signInWithOtp({ email: text });

  if (error) {
    await sendMessage({ chatId, text: `Не удалось отправить код: ${error.message}` });
    return;
  }

  await updateLink(chatId, { pending_email: text, state: "awaiting_otp" });
  await sendMessage({
    chatId,
    text: `Мы отправили 6-значный код на ${text}. Пришлите его сюда.`,
  });
}

async function handleOtpStep(
  chatId: number,
  link: TelegramLink,
  text: string,
): Promise<void> {
  if (!OTP_RE.test(text) || !link.pending_email) {
    await sendMessage({ chatId, text: "Пришлите 6-значный код из письма." });
    return;
  }

  const auth = createSupabaseAuthClient();
  const { data, error } = await auth.auth.verifyOtp({
    email: link.pending_email,
    token: text,
    type: "email",
  });

  if (error || !data.user) {
    await sendMessage({
      chatId,
      text: "Код неверен или устарел. Попробуйте ещё раз или пришлите email заново.",
    });
    return;
  }

  await updateLink(chatId, {
    user_id: data.user.id,
    pending_email: null,
    state: "idle",
  });
  await sendMessage({
    chatId,
    text: "Готово, вы вошли в Науз! Команды: /voices — ваши голоса, /newvoice — добавить новый голос.",
  });
}

async function handleVoiceLabelStep(
  chatId: number,
  link: TelegramLink,
  label: string,
): Promise<void> {
  if (!link.user_id) return;
  const admin = createSupabaseAdminClient();

  const { data: voice, error } = await admin
    .from("voices")
    .insert({
      owner_id: link.user_id,
      label,
      status: "awaiting_kyc",
      consent_given_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !voice) {
    await sendMessage({ chatId, text: "Не удалось создать голос, попробуйте снова." });
    await updateLink(chatId, { state: "idle" });
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", link.user_id)
    .single();

  try {
    const { redirectUrl } = await startKycForVoice({
      userId: link.user_id,
      voiceId: voice.id,
      email: profile?.email ?? "",
    });

    await updateLink(chatId, { state: "idle", pending_voice_id: voice.id });

    const absoluteUrl = redirectUrl.startsWith("http")
      ? redirectUrl
      : `${siteUrl()}${redirectUrl}`;
    await sendMessage({
      chatId,
      text: `Голос «${label}» создан. Пройдите подтверждение личности по ссылке, затем пришлите сюда голосовое сообщение с образцом голоса (~60 секунд):\n${absoluteUrl}`,
    });
  } catch (err) {
    await updateLink(chatId, { state: "idle" });
    await sendMessage({
      chatId,
      text: `Не удалось запустить подтверждение личности: ${
        err instanceof Error ? err.message : "неизвестная ошибка"
      }`,
    });
  }
}

async function handleAudioMessage(
  chatId: number,
  link: TelegramLink,
  attachment: TelegramVoiceOrAudio,
): Promise<void> {
  if (!link.user_id) {
    await sendMessage({ chatId, text: "Сначала войдите — отправьте /start." });
    return;
  }
  if (!link.pending_voice_id) {
    await sendMessage({
      chatId,
      text: "Нет голоса, ожидающего образец. Начните с /newvoice.",
    });
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: voice } = await admin
    .from("voices")
    .select("*")
    .eq("id", link.pending_voice_id)
    .single();

  const status: VoiceStatus | undefined = voice?.status;
  if (!voice || (status !== "kyc_approved" && status !== "failed")) {
    await sendMessage({
      chatId,
      text: "Сначала нужно пройти подтверждение личности по присланной ранее ссылке.",
    });
    return;
  }

  await sendMessage({ chatId, text: "Получили образец, клонируем голос..." });

  try {
    await withChatAction(chatId, "typing", async () => {
      const filePath = await getFile(attachment.file_id);
      const buffer = await downloadFile(filePath);
      const audio = new Blob([buffer], {
        type: attachment.mime_type ?? "audio/ogg",
      });
      await cloneVoiceSample({ userId: link.user_id!, voiceId: voice.id, audio });
    });
    await updateLink(chatId, { pending_voice_id: null });
    await sendMessage({
      chatId,
      text: `Голос «${voice.label}» готов! Отправьте /voices, чтобы создать сказку этим голосом.`,
    });
  } catch (err) {
    await sendMessage({
      chatId,
      text: `Не удалось клонировать голос: ${
        err instanceof Error ? err.message : "неизвестная ошибка"
      }`,
    });
  }
}

function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "awaiting_kyc":
      return "ожидает подтверждения личности";
    case "kyc_approved":
      return "подтверждён, пришлите голосовое сообщение с образцом";
    case "cloning":
      return "создаём голос...";
    case "ready":
      return "готов";
    case "failed":
      return "ошибка — пришлите голосовое сообщение ещё раз";
    case "revoked":
      return "доступ отозван";
  }
}

async function listVoices(chatId: number, userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: voices } = await admin
    .from("voices")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (!voices?.length) {
    await sendMessage({
      chatId,
      text: "У вас пока нет голосов. Отправьте /newvoice, чтобы добавить первый.",
    });
    return;
  }

  const keyboard: InlineKeyboard = [];
  const lines: string[] = [];
  for (const voice of voices as Voice[]) {
    lines.push(`• ${voice.label} — ${statusLabel(voice.status)}`);
    if (voice.status === "ready") {
      keyboard.push([
        { text: `📖 Сказка «${voice.label}»`, callback_data: `story:templates:${voice.id}` },
      ]);
    }
  }

  await sendMessage({ chatId, text: lines.join("\n"), replyMarkup: keyboard.length ? keyboard : undefined });
}

async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  if (!query.message || !query.data) return;
  const chatId = query.message.chat.id;
  await answerCallbackQuery(query.id);

  const link = await getOrCreateLink(chatId);
  if (!link.user_id) {
    await sendMessage({ chatId, text: "Сначала войдите — отправьте /start." });
    return;
  }

  const [scope, action, ...rest] = query.data.split(":");
  if (scope !== "story") return;

  if (action === "templates") {
    const [voiceId] = rest;
    const admin = createSupabaseAdminClient();
    const { data: templates } = await admin
      .from("story_templates")
      .select("id, title")
      .order("title", { ascending: true });

    if (!templates?.length) {
      await sendMessage({ chatId, text: "Пока нет ни одной готовой сказки." });
      return;
    }

    // callback_data у Telegram ограничен 64 байтами — два UUID (voiceId +
    // templateId) в одной строке в это не укладываются (~83 байта, отсюда
    // была ошибка BUTTON_DATA_INVALID). Поэтому voiceId кладём в БД, а в
    // кнопке остаётся только templateId.
    await updateLink(chatId, { pending_story_voice_id: voiceId });
    const keyboard: InlineKeyboard = templates.map((t) => [
      { text: t.title, callback_data: `story:gen:${t.id}` },
    ]);
    await sendMessage({ chatId, text: "Какую сказку озвучить?", replyMarkup: keyboard });
    return;
  }

  if (action === "gen") {
    const [templateId] = rest;
    const voiceId = link.pending_story_voice_id;
    if (!voiceId) {
      await sendMessage({
        chatId,
        text: "Не помню, какой голос выбирали — начните заново с /voices.",
      });
      return;
    }
    await sendMessage({ chatId, text: "Генерируем аудио, это может занять минуту..." });

    try {
      const { storyId } = await withChatAction(chatId, "upload_voice", () =>
        generateStoryAudio({
          userId: link.user_id!,
          voiceId,
          templateId,
          speed: 1.0,
        }),
      );

      const admin = createSupabaseAdminClient();
      const { data: generation } = await admin
        .from("audio_generations")
        .select("audio_url")
        .eq("story_id", storyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (generation?.audio_url) {
        const { data: fileData } = await admin.storage
          .from("audio-generations")
          .download(generation.audio_url);
        if (fileData) {
          await sendAudio({
            chatId,
            audio: await fileData.arrayBuffer(),
            filename: "story.mp3",
            caption: `${siteUrl()}/stories/${storyId}`,
          });
          return;
        }
      }

      await sendMessage({ chatId, text: `Готово: ${siteUrl()}/stories/${storyId}` });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `Не удалось создать сказку: ${
          err instanceof Error ? err.message : "неизвестная ошибка"
        }`,
      });
    }
  }
}
