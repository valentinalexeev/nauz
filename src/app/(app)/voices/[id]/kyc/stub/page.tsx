import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";

/**
 * Экран-заглушка для локальной разработки, имитирующий прохождение KYC.
 * В проде эта страница не используется — пользователь проходит проверку
 * на стороне реального провайдера и возвращается через вебхук
 * /api/kyc/webhook.
 */
export default async function KycStubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  async function approve() {
    "use server";
    const admin = createSupabaseAdminClient();
    await admin
      .from("kyc_verifications")
      .update({ status: "approved" })
      .eq("voice_id", id);
    await admin
      .from("voices")
      .update({ status: "kyc_approved" })
      .eq("id", id);
    redirect(`/voices/${id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 text-center">
      <h1 className="font-serif text-xl font-medium text-ink">
        Подтверждение личности (заглушка)
      </h1>
      <p className="text-sm text-ink-soft">
        В боевой версии здесь открывается флоу реального KYC-провайдера.
        Сейчас используется тестовая заглушка для разработки.
      </p>
      <form action={approve}>
        <Button type="submit">Симулировать успешное прохождение</Button>
      </form>
    </div>
  );
}
