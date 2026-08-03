import "server-only";

const TELEGRAM_API_BASE = "https://api.telegram.org";

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  return token;
}

async function callApi<T>(method: string, payload: unknown): Promise<T> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  }
  return data.result as T;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export async function sendMessage({
  chatId,
  text,
  replyMarkup,
}: {
  chatId: number;
  text: string;
  replyMarkup?: InlineKeyboard;
}): Promise<void> {
  await callApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined,
  });
}

export async function sendAudio({
  chatId,
  audio,
  filename,
  caption,
}: {
  chatId: number;
  audio: ArrayBuffer;
  filename: string;
  caption?: string;
}): Promise<void> {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption);
  form.set("audio", new Blob([audio], { type: "audio/mpeg" }), filename);

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken()}/sendAudio`, {
    method: "POST",
    body: form,
  });

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram sendAudio failed: ${data.description ?? res.status}`);
  }
}

export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await callApi("answerCallbackQuery", { callback_query_id: callbackQueryId });
}

/**
 * Заполняет меню команд бота (кнопка "/" рядом с полем ввода в Telegram).
 * Настройка глобальная для бота, не привязана к конкретному чату — вызывать
 * достаточно один раз, но повторные вызовы безвредны (просто перезапишут).
 */
export async function setMyCommands(
  commands: { command: string; description: string }[],
): Promise<void> {
  await callApi("setMyCommands", { commands });
}

export type ChatAction =
  | "typing"
  | "upload_voice"
  | "record_voice"
  | "upload_document";

/**
 * Показывает статус "печатает…"/"отправляет голосовое…" в чате. Telegram
 * гаснет его сам через ~5 секунд — для долгих операций нужно вызывать
 * повторно (см. withChatAction в src/lib/telegram/bot.ts).
 */
export async function sendChatAction({
  chatId,
  action,
}: {
  chatId: number;
  action: ChatAction;
}): Promise<void> {
  await callApi("sendChatAction", { chat_id: chatId, action });
}

/** Возвращает file_path, используемый для скачивания через downloadFile(). */
export async function getFile(fileId: string): Promise<string> {
  const result = await callApi<{ file_path: string }>("getFile", { file_id: fileId });
  return result.file_path;
}

export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const res = await fetch(`${TELEGRAM_API_BASE}/file/bot${botToken()}/${filePath}`);
  if (!res.ok) {
    throw new Error(`Telegram file download failed: ${res.status}`);
  }
  return res.arrayBuffer();
}
