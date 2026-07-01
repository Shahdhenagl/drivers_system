"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { WA_PREF_KEY } from "@/lib/whatsapp";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Pref = "normal" | "business" | "ask";

const OPTIONS: { key: Pref; label: string }[] = [
  { key: "ask", label: "يسأل كل مرة" },
  { key: "normal", label: "واتساب عادي" },
  { key: "business", label: "واتساب بزنس" },
];

/** إعداد التطبيق الافتراضي لفتح روابط واتساب (يُحفظ محليًا على الجهاز) */
export function WhatsAppDefaultSetting() {
  const [pref, setPref] = useState<Pref>("ask");

  useEffect(() => {
    const stored = localStorage.getItem(WA_PREF_KEY);
    if (stored === "normal" || stored === "business") setPref(stored);
    else setPref("ask");
  }, []);

  function choose(p: Pref) {
    setPref(p);
    if (p === "ask") localStorage.removeItem(WA_PREF_KEY);
    else localStorage.setItem(WA_PREF_KEY, p);
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-success" />
        تطبيق واتساب الافتراضي
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => choose(o.key)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
              pref === o.key
                ? "border-success bg-success text-success-foreground"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
