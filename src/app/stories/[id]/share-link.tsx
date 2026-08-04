"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareLink({
  storyId,
  baseUrl,
  token,
}: {
  storyId: string;
  baseUrl: string;
  token: string;
}) {
  const [currentToken, setCurrentToken] = useState(token);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const url = `${baseUrl}/s/${currentToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (
      !window.confirm(
        "Старая ссылка перестанет работать. Обновить ссылку для этой записи?",
      )
    ) {
      return;
    }
    setRegenerating(true);
    const res = await fetch(`/api/stories/${storyId}/share`, { method: "POST" });
    if (res.ok) {
      const { shareToken } = (await res.json()) as { shareToken: string };
      setCurrentToken(shareToken);
    } else {
      window.alert("Не удалось обновить ссылку");
    }
    setRegenerating(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-100 px-4 py-3 text-sm">
      <p className="text-neutral-600">
        Ссылка для проигрывания без входа в Науз — можно отправить ребёнку.
        Покажет все голоса, которыми вы озвучили эту запись.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700"
        />
        <Button type="button" size="sm" onClick={handleCopy}>
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
      </div>
      <Button
        type="button"
        variant="link"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="h-auto w-fit p-0 text-xs text-neutral-500 underline"
      >
        {regenerating ? "Обновляем..." : "Обновить ссылку"}
      </Button>
    </div>
  );
}
