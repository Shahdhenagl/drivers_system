"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";

/** فلتر أسبوعي — القيمة إزاحة الأسبوع (0 الحالي، -1 السابق ...) */
export function WeekFilter({
  weeks,
  selected,
}: {
  weeks: { value: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("w", value);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {weeks.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}
