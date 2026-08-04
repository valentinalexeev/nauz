"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteButton({
  endpoint,
  confirmMessage,
}: {
  endpoint: string;
  confirmMessage: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) return;
    setDeleting(true);

    const res = await fetch(endpoint, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
      window.alert("Не удалось удалить");
    }
  }

  return (
    <Button
      type="button"
      variant="link"
      onClick={handleDelete}
      disabled={deleting}
      className="text-destructive h-auto p-0 text-xs underline"
    >
      {deleting ? "Удаляем..." : "Удалить"}
    </Button>
  );
}
