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
  /** Озвучивать recap-вопросы предыдущей главы. По умолчанию — да. */
  includeRecap?: boolean;
  /**
   * Пауза (сек) между recap-аудио и главой на плеере — 0 значит "сразу".
   * Сама пауза управляется на клиенте (ChapterPlayer), здесь только
   * сохраняется вместе с генерацией для отображения при следующем открытии.
   */
  recapDelaySeconds?: number;
}

export interface GenerateChapterAudioResult {
  generationId: string;
}

async function synthesizeToStorage(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  text: string;
  elevenlabsVoiceId: string;
  speed: number;
  userId: string;
  voiceId: string;
  generationId: string;
  pathSuffix: string;
  kycProvider: string | null;
  kycSessionId: string | null;
}): Promise<{ path: string; watermarkId: string }> {
  const audio = await generateLongSpeech({
    voiceId: params.elevenlabsVoiceId,
    text: params.text,
    languageCode: "ru",
    speed: params.speed,
  });

  const { audio: watermarkedAudio, watermarkId } = await embedWatermark(audio, {
    ownerId: params.userId,
    voiceId: params.voiceId,
    generationId: params.generationId,
  });

  const taggedAudio = embedProvenanceTags(watermarkedAudio, {
    generationId: params.generationId,
    voiceId: params.voiceId,
    kycProvider: params.kycProvider,
    kycSessionId: params.kycSessionId,
  });

  const path = `${params.userId}/${params.generationId}${params.pathSuffix}.mp3`;
  const { error: uploadError } = await params.admin.storage
    .from("audio-generations")
    .upload(path, Buffer.from(taggedAudio), { contentType: "audio/mpeg" });

  if (uploadError) throw uploadError;
  return { path, watermarkId };
}

/**
 * Озвучивает главу книги выбранным голосом. Если это не первая глава, у
 * предыдущей главы есть recap_questions_marked ("вопросы по предыдущей
 * главе" — см. миграцию 0014) и includeRecap не отключён явно — recap
 * озвучивается ОТДЕЛЬНЫМ аудиофайлом (recap_audio_url), а не склеивается
 * с главой в один mp3: так на плеере между ними получается настоящая
 * пауза (ChapterPlayer на клиенте), а не просто переходная фраза внутри
 * непрерывной записи.
 *
 * Общая логика для /api/books/[bookId]/chapters/[chapterId]/generate (веб)
 * и Telegram-бота.
 */
export async function generateChapterAudio({
  userId,
  voiceId,
  chapterId,
  speed = 1.0,
  includeRecap = true,
  recapDelaySeconds = 5,
}: GenerateChapterAudioParams): Promise<GenerateChapterAudioResult> {
  if (!ALLOWED_SPEEDS.includes(speed)) {
    throw new Error("invalid speed");
  }
  if (recapDelaySeconds < 0 || recapDelaySeconds > 60) {
    throw new Error("invalid recap delay");
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

  let recapText: string | null = null;
  if (includeRecap && chapter.order_index > 1) {
    const { data: previousChapter } = await admin
      .from("book_chapters")
      .select("recap_questions_marked")
      .eq("book_id", chapter.book_id)
      .eq("order_index", chapter.order_index - 1)
      .single();
    recapText = previousChapter?.recap_questions_marked ?? null;
  }

  const { data: generation } = await admin
    .from("book_chapter_generations")
    .insert({
      chapter_id: chapter.id,
      voice_id: voice.id,
      owner_id: userId,
      status: "processing",
      recap_delay_seconds: recapDelaySeconds,
    })
    .select()
    .single();

  try {
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

    let recapAudioPath: string | null = null;
    if (recapText) {
      const recap = await synthesizeToStorage({
        admin,
        text: recapText,
        elevenlabsVoiceId: voice.elevenlabs_voice_id,
        speed,
        userId,
        voiceId: voice.id,
        generationId: generation!.id,
        pathSuffix: "-recap",
        kycProvider,
        kycSessionId,
      });
      recapAudioPath = recap.path;
    }

    const chapterAudio = await synthesizeToStorage({
      admin,
      text: chapter.text_marked,
      elevenlabsVoiceId: voice.elevenlabs_voice_id,
      speed,
      userId,
      voiceId: voice.id,
      generationId: generation!.id,
      pathSuffix: "",
      kycProvider,
      kycSessionId,
    });

    await admin
      .from("book_chapter_generations")
      .update({
        status: "ready",
        audio_url: chapterAudio.path,
        recap_audio_url: recapAudioPath,
        watermark_id: chapterAudio.watermarkId,
      })
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
