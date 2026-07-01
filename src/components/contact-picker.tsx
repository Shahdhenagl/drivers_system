"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

type PickedContact = { name?: string[]; tel?: string[] };
type NavigatorContacts = {
  contacts?: {
    select: (
      props: string[],
      opts?: { multiple?: boolean }
    ) => Promise<PickedContact[]>;
  };
};

/** توحيد رقم مصري إلى صيغة محلية 01xxxxxxxxx */
function normalizeEgyptianPhone(raw: string): string {
  let n = (raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("0020")) n = n.slice(4);
  if (n.startsWith("20") && n.length === 12) n = n.slice(2);
  if (n && !n.startsWith("0")) n = "0" + n;
  return n;
}

/**
 * زر أفاتار لاختيار جهة اتصال من التليفون (Contact Picker API).
 * يعمل على Chrome أندرويد فقط عبر HTTPS.
 */
export function ContactPickerAvatar({
  onPick,
}: {
  onPick: (name: string, phone: string) => void;
}) {
  const [msg, setMsg] = useState("");

  async function pick() {
    setMsg("");
    const nav = navigator as unknown as NavigatorContacts;
    if (!nav.contacts?.select) {
      setMsg("استيراد جهات الاتصال متاح على متصفح Chrome في الأندرويد فقط");
      return;
    }
    try {
      const res = await nav.contacts.select(["name", "tel"], { multiple: false });
      if (!res || res.length === 0) return;
      const c = res[0];
      const name = (c.name && c.name[0]) || "";
      const phone = normalizeEgyptianPhone((c.tel && c.tel[0]) || "");
      onPick(name, phone);
    } catch {
      // المستخدم ألغى الاختيار — تجاهل
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={pick}
        aria-label="اختيار من جهات الاتصال"
        className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition active:scale-95"
      >
        <UserRound className="h-7 w-7" />
      </button>
      <span className="text-[11px] text-muted-foreground">من جهات الاتصال</span>
      {msg && (
        <span className="max-w-[220px] text-center text-[11px] text-destructive">
          {msg}
        </span>
      )}
    </div>
  );
}
