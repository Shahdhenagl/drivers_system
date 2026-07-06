"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, toEgp } from "@/lib/money";
import { MapPin, Search } from "lucide-react";

export type RouteMemory = {
  startPoint: string;
  endPoint: string;
  contractorPrice: number; // قروش
  driverDue: number; // قروش
};

/**
 * حقلا نقطة البداية/النهاية مع ذاكرة أسعار: يقترح المسارات المستخدَمة سابقًا أثناء الكتابة،
 * وعند اختيار مسار يملأ البداية والنهاية ويستدعي onPickRoute بآخر سعر (قابل للتعديل بعدها).
 */
export function RouteFields({
  routes,
  onPickRoute,
  defaultStart = "",
  defaultEnd = "",
}: {
  routes: RouteMemory[];
  onPickRoute?: (contractorPriceEgp: string, driverDueEgp: string) => void;
  defaultStart?: string;
  defaultEnd?: string;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [openField, setOpenField] = useState<null | "start" | "end">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenField(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function suggestions(field: "start" | "end") {
    const q = (field === "start" ? start : end).trim().toLowerCase();
    const list = q
      ? routes.filter(
          (r) =>
            r.startPoint.toLowerCase().includes(q) ||
            r.endPoint.toLowerCase().includes(q)
        )
      : routes;
    return list.slice(0, 8);
  }

  function pick(r: RouteMemory) {
    setStart(r.startPoint);
    setEnd(r.endPoint);
    setOpenField(null);
    onPickRoute?.(String(toEgp(r.contractorPrice)), String(toEgp(r.driverDue)));
  }

  const sugg = openField ? suggestions(openField) : [];

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="relative space-y-1.5">
        <Label htmlFor="startPoint">نقطة البداية *</Label>
        <Input
          id="startPoint"
          name="startPoint"
          autoComplete="off"
          required
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setOpenField("start");
          }}
          onFocus={() => setOpenField("start")}
        />
        {openField === "start" && sugg.length > 0 && (
          <RouteDropdown routes={sugg} onPick={pick} />
        )}
      </div>

      <div className="relative space-y-1.5">
        <Label htmlFor="endPoint">نقطة النهاية *</Label>
        <Input
          id="endPoint"
          name="endPoint"
          autoComplete="off"
          required
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            setOpenField("end");
          }}
          onFocus={() => setOpenField("end")}
        />
        {openField === "end" && sugg.length > 0 && (
          <RouteDropdown routes={sugg} onPick={pick} />
        )}
      </div>
    </div>
  );
}

function RouteDropdown({
  routes,
  onPick,
}: {
  routes: RouteMemory[];
  onPick: (r: RouteMemory) => void;
}) {
  return (
    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <Search className="h-3.5 w-3.5" /> مسارات محفوظة — اختَر لجلب آخر سعر
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {routes.map((r, i) => (
          <button
            key={`${r.startPoint}-${r.endPoint}-${i}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(r)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-right text-sm outline-none hover:bg-accent"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-1">
                {r.startPoint} ← {r.endPoint}
              </span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-primary">
              {formatMoney(r.contractorPrice, false)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
