import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKycProvider } from "@/lib/kyc/provider";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { voiceId } = (await request.json()) as { voiceId: string };

  const provider = getKycProvider();
  const result = await provider.startVerification({
    userId: user.id,
    voiceId,
    email: user.email!,
  });

  // service-role клиент: запись верификации создаётся от имени системы
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("kyc_verifications").insert({
    voice_id: voiceId,
    user_id: user.id,
    provider: provider.name,
    external_reference_id: result.externalReferenceId,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
