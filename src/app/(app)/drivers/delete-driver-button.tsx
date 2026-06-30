"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteDriver } from "./actions";

export function DeleteDriverButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!confirm("هل تريد حذف هذا السواق نهائيًا؟")) return;
    setLoading(true);
    try {
      const res = await deleteDriver(id);
      if (res?.error) {
        alert(res.error);
        setLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("NEXT_REDIRECT")) {
        alert("تعذّر الحذف");
        setLoading(false);
      }
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-destructive print:hidden"
      onClick={handle}
      disabled={loading}
      aria-label="حذف"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
