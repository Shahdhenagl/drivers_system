"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * علامة المراجعة اليومية للحساب.
 * تظهر مُفعّلة (صح أخضر) لو تمت المراجعة اليوم، وتتصفّر تلقائيًا كل يوم جديد
 * (الاشتقاق يتم في صفحة السيرفر بمقارنة تاريخ آخر مراجعة بتاريخ اليوم).
 */
export function DailyReviewToggle({
  reviewedToday,
  action,
}: {
  reviewedToday: boolean;
  action: (reviewed: boolean) => Promise<void>;
}) {
  const [reviewed, setReviewed] = useState(reviewedToday);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !reviewed;
    setReviewed(next); // تحديث تفاؤلي
    start(async () => {
      try {
        await action(next);
      } catch {
        setReviewed(!next); // تراجع عند الفشل
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={reviewed}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60",
        reviewed
          ? "border-success/30 bg-success/10 text-success"
          : "border-input bg-background text-muted-foreground"
      )}
    >
      {reviewed ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Circle className="h-5 w-5" />
      )}
      {reviewed ? "تمت مراجعته اليوم" : "تحديد كمُراجَع اليوم"}
    </button>
  );
}
