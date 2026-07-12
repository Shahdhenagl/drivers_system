"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function MonthFilter({ currentMonth }: { currentMonth: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setMonth(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (month) params.set("month", month);
    else params.delete("month");
    router.replace(`/finance?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Input
        type="month"
        value={currentMonth}
        onChange={(e) => setMonth(e.target.value)}
        className="h-9 w-[150px]"
        aria-label="فلتر الشهر"
      />
      <Button type="button" variant="outline" size="sm" onClick={() => setMonth("")}>
        آخر الحركات
      </Button>
    </div>
  );
}
