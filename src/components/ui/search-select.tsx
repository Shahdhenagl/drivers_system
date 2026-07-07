"use client";

import * as React from "react";
import { Check, ChevronDown, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayPhone } from "@/lib/phone";

export type SearchOption = { id: string; name: string; phone: string };

/**
 * قائمة اختيار مع بحث بالاسم/الرقم — بديل خفيف للـ Select العادي.
 * القيمة "__new__" مخصّصة لإضافة عنصر جديد (تظهر ثابتة في الأعلى).
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  newLabel,
  searchPlaceholder = "ابحث بالاسم أو الرقم…",
  emptyText = "لا يوجد نتائج",
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder: string;
  newLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // إغلاق عند الضغط خارج المكوّن
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // تركيز حقل البحث عند الفتح
  React.useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const filtered = q
    ? options.filter((o) => {
        const byName = o.name.toLowerCase().includes(q);
        const byPhone =
          qDigits.length > 0 && o.phone.replace(/\D/g, "").includes(qDigits);
        return byName || byPhone;
      })
    : options;

  const selected =
    value === "__new__"
      ? null
      : options.find((o) => o.id === value) ?? null;

  const triggerLabel =
    value === "__new__"
      ? newLabel ?? "جديد"
      : selected
        ? `${selected.name} — ${displayPhone(selected.phone)}`
        : placeholder;

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring [&>span]:line-clamp-1",
          !selected && value !== "__new__" && "text-muted-foreground",
          invalid && "border-destructive ring-1 ring-destructive"
        )}
      >
        <span>{triggerLabel}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {newLabel && (
              <button
                type="button"
                onClick={() => pick("__new__")}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-base text-primary outline-none hover:bg-accent"
              >
                <UserPlus className="h-4 w-4" /> {newLabel}
              </button>
            )}

            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className="relative flex w-full cursor-pointer items-center rounded-lg py-2.5 pr-8 pl-2 text-base outline-none hover:bg-accent"
              >
                <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                  {value === o.id && <Check className="h-4 w-4" />}
                </span>
                <span className="line-clamp-1 text-right">
                  {o.name} — {displayPhone(o.phone)}
                </span>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
