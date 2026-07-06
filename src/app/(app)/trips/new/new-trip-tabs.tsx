"use client";

import { useState } from "react";
import { TripForm } from "./trip-form";
import { MultiDayTripForm } from "./multi-day-trip-form";
import type { RouteMemory } from "@/components/route-fields";
import { CalendarDays, CalendarRange } from "lucide-react";

type Option = { id: string; name: string; phone: string };

export function NewTripTabs({
  contractors,
  drivers,
  routes,
}: {
  contractors: Option[];
  drivers: Option[];
  routes: RouteMemory[];
}) {
  const [mode, setMode] = useState<"single" | "multi">("single");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
            mode === "single"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          <CalendarDays className="h-4 w-4" /> يوم واحد
        </button>
        <button
          type="button"
          onClick={() => setMode("multi")}
          className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
            mode === "multi"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          <CalendarRange className="h-4 w-4" /> عدة أيام
        </button>
      </div>

      {mode === "single" ? (
        <TripForm contractors={contractors} drivers={drivers} routes={routes} />
      ) : (
        <MultiDayTripForm contractors={contractors} drivers={drivers} routes={routes} />
      )}
    </div>
  );
}
