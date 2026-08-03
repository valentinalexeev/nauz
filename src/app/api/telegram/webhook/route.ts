import { NextResponse } from "next/server";
import { handleUpdate, type TelegramUpdate } from "@/lib/telegram/bot";

/**
 * Вебхук Telegram. Авторизация — секрет, который Telegram прикладывает
 * в заголовке (задаётся при setWebhook через параметр secret_token), а не
 * подпись запроса: без него любой мог бы слать нам поддельные обновления.
 *
 * Всегда отвечаем 200 (кроме ошибки авторизации) — иначе Telegram будет
 * бесконечно ретраить обновление, если обработка упала.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("telegram webhook error", err);
  }

  return NextResponse.json({ ok: true });
}
