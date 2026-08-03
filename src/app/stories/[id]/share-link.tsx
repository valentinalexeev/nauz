"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-100 px-4 py-3 text-sm">
      <p className="text-neutral-600">
        Ссылка для проигрывания без входа в Науз — можно отправить ребёнку:
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
    </div>
  );
}
