import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateLongSpeech } from "@/lib/elevenlabs/long-speech";
import { embedWatermark } from "@/lib/watermark";
import { embedProvenanceTags } from "@/lib/provenance/id3-tags";
import { ALLOWED_SPEEDS } from "@/lib/stories/speed-options";

export interface GenerateChapterAudioParams {
  userId: string;
  voiceId: string;
  chapterId: string;
  speed?: number;
}

export interface GenerateChapterAudioResult {
  generationId: string;
}

/**
 * Озвучивает главу книги выбранным голосом. Если это не первая глава и у
 * предыдущей главы есть recap_questions_marked ("вопросы по предыдущей
 * главе" — см. миграцию 0014), они склеиваются перед текстом текущей главы
 * через переходную фразу — получается один цельный аудиофайл "вспомним
 * прошлый раз + сама глава", а не два отдельных.
 *
 * Общая логика для /api/books/[bookId]/chapters/[chapterId]/generate (веб)
 * и Telegram-бота.
 */
export async function generateChapterAudio({
  userId,
  voiceId,
  chapterId,
  speed = 1.0,
}: GenerateChapterAudioParams): Promise<GenerateChapterAudioResult> {
  if (!ALLOWED_SPEEDS.includes(speed)) {
    throw new Error("invalid speed");
  }

  const admin = createSupabaseAdminClient();

  const { data: voice } = await admin
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", userId)
    .eq("status", "ready")
    .single();

  if (!voice?.elevenlabs_voice_id) {
    throw new Error("voice not ready");
  }

  const { data: chapter } = await admin
    .from("book_chapters")
    .select("*")
    .eq("id", chapterId)
    .single();

  if (!chapter) {
    throw new Error("chapter not found");
  }

  let textMarked = chapter.text_marked;
  if (chapter.order_index > 1) {
    const { data: previousChapter } = await admin
      .from("book_chapters")
      .select("recap_questions_marked")
      .eq("book_id", chapter.book_id)
      .eq("order_index", chapter.order_index - 1)
      .single();

    if (previousChapter?.recap_questions_marked) {
      textMarked = `${previousChapter.recap_questions_marked}\n\n[warm, transitioning] А теперь — продолжение истории.\n\n${chapter.text_marked}`;
    }
  }

  const { data: generation } = await admin
    .from("book_chapter_generations")
    .insert({
      chapter_id: chapter.id,
      voice_id: voice.id,
      owner_id: userId,
      status: "processing",
    })
    .select()
    .single();

  try {
    const audio = await generateLongSpeech({
      voiceId: voice.elevenlabs_voice_id,
      text: textMarked,
      languageCode: "ru",
      speed,
    });

    const { audio: watermarkedAudio, watermarkId } = await embedWatermark(audio, {
      ownerId: userId,
      voiceId: voice.id,
      generationId: generation!.id,
    });

    // Для провенанса — как и в generate-audio.ts, на случай утечки нужно
    // уметь выйти на человека, загрузившего образец и прошедшего KYC.
    let kycProvider: string | null = null;
    let kycSessionId: string | null = null;
    if (voice.kyc_verification_id) {
      const { data: verification } = await admin
        .from("kyc_verifications")
        .select("provider, external_reference_id")
        .eq("id", voice.kyc_verification_id)
        .single();
      kycProvider = verification?.provider ?? null;
      kycSessionId = verification?.external_reference_id ?? null;
    }

    const taggedAudio = embedProvenanceTags(watermarkedAudio, {
      generationId: generation!.id,
      voiceId: voice.id,
      kycProvider,
      kycSessionId,
    });

    const path = `${userId}/${generation!.id}.mp3`;
    const { error: uploadError } = await admin.storage
      .from("audio-generations")
      .upload(path, Buffer.from(taggedAudio), {
        contentType: "audio/mpeg",
      });

    if (uploadError) throw uploadError;

    await admin
      .from("book_chapter_generations")
      .update({ status: "ready", audio_url: path, watermark_id: watermarkId })
      .eq("id", generation!.id);
  } catch (err) {
    await admin
      .from("book_chapter_generations")
      .update({ status: "failed" })
      .eq("id", generation!.id);
    throw err;
  }

  return { generationId: generation!.id };
}
