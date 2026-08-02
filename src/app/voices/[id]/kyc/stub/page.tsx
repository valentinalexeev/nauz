import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    redirect("/dashboard");
  }

  return (
    <main className="flex-1 max-w-md w-full mx-auto px-6 py-16 flex flex-col gap-6 text-center">
      <h1 className="text-xl font-semibold">Подтверждение личности (заглушка)</h1>
      <p className="text-sm text-neutral-600">
        В боевой версии здесь открывается флоу реального KYC-провайдера.
        Сейчас используется тестовая заглушка для разработки.
      </p>
      <form action={approve}>
        <button
          type="submit"
          className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium"
        >
          Симулировать успешное прохождение
        </button>
      </form>
    </main>
  );
}
