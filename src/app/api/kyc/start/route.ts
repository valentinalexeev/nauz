import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startKycForVoice } from "@/lib/voices/start-kyc";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { voiceId } = (await request.json()) as { voiceId: string };

  try {
    const { redirectUrl } = await startKycForVoice({
      userId: user.id,
      voiceId,
      email: user.email!,
    });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "kyc start failed" },
      { status: 500 },
    );
  }
}
