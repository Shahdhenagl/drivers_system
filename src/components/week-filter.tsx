"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange, ChevronRight, ChevronLeft } from "lucide-react";

/**
 * فلتر أسبوعي (الأسبوع المصري: السبت → الجمعة).
 * القيمة إمّا إزاحة الأسبوع (0 الحالي، -1 السابق ...) في صفحة التصفية الأسبوعية،
 * أو مفتاح الأسبوع "yyyy-MM-dd" (تاريخ السبت) في صفحات الحسابات.
 * الأسهم تتنقّل بين الأسابيع المتاحة أسبوعًا بأسبوع.
 */
export function WeekFilter({
  weeks,
  selected,
  param = "w",
}: {
  weeks: { value: string; label: string }[];
  selected: string;
  /** اسم الباراميتر في الرابط */
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(param, value);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  // القائمة مرتَّبة من الأحدث للأقدم: الفهرس الأكبر = أقدم
  const index = weeks.findIndex((w) => w.value === selected);
  const older = index >= 0 && index < weeks.length - 1 ? weeks[index + 1] : null;
  const newer = index > 0 ? weeks[index - 1] : null;

  const arrow =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground transition hover:bg-accent disabled:opacity-40 disabled:hover:bg-background";

  return (
    <div className="flex items-center gap-2 print:hidden">
      <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className={arrow}
        disabled={!older}
        title="الأسبوع الأقدم"
        aria-label="الأسبوع الأقدم"
        onClick={() => older && onChange(older.value)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
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
      <button
        type="button"
        className={arrow}
        disabled={!newer}
        title="الأسبوع الأحدث"
        aria-label="الأسبوع الأحدث"
        onClick={() => newer && onChange(newer.value)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
