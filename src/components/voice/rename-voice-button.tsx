"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RenameVoiceButton({
  voiceId,
  currentLabel,
}: {
  voiceId: string;
  currentLabel: string;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);

  async function handleRename() {
    const next = window.prompt("Новое имя голоса", currentLabel);
    if (!next || !next.trim() || next.trim() === currentLabel) return;

    setRenaming(true);
    const res = await fetch(`/api/voices/${voiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: next.trim() }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      window.alert("Не удалось переименовать голос");
    }
    setRenaming(false);
  }

  return (
    <Button
      type="button"
      variant="link"
      onClick={handleRename}
      disabled={renaming}
      className="h-auto p-0 text-xs underline"
    >
      {renaming ? "Сохраняем..." : "Переименовать"}
    </Button>
  );
}
