"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteDriver } from "./actions";
import { playSound } from "@/lib/sounds";

export function DeleteDriverButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (
      !confirm(
        "حذف السواق سيمسح نهائيًا كل معاملاته المالية (رحلاته وتحصيلاتها وسداداتها وسلفه وسلفه الخارجية)، وتتعدّل الخزنة والأرباح تلقائيًا. لا يمكن التراجع. متأكد؟"
      )
    )
      return;
    setLoading(true);
    try {
      await deleteDriver(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("NEXT_REDIRECT")) {
        playSound("error");
        alert("تعذّر الحذف");
        setLoading(false);
      } else {
        playSound("cancel");
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
