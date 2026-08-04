"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-paper px-6 py-24">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="text-center">
          <div className="mb-2 font-serif text-xl font-semibold text-ink">Науз</div>
          <h1 className="font-serif text-2xl font-medium text-ink">Вход по ссылке</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Без пароля — пришлём одноразовую ссылку на почту.
          </p>
        </div>

        {status === "sent" ? (
          <p className="rounded-2xl bg-surface px-5 py-4 text-center text-sm text-ink-soft">
            Мы отправили ссылку для входа на {email}. Откройте письмо и
            перейдите по ссылке.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Отправляем..." : "Прислать ссылку для входа"}
            </Button>
            {status === "error" && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
