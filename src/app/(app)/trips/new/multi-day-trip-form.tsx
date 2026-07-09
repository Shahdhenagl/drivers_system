"use client";

import { useCallback, useState } from "react";
import { SearchSelect } from "@/components/ui/search-select";
import { RouteFields, type RouteMemory } from "@/components/route-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { createMultiDayTrip } from "../actions";
import { playSound } from "@/lib/sounds";
import { toDateInput } from "@/lib/format";
import { formatMoney, toPiastres } from "@/lib/money";
import { TRIP_VEHICLE_TYPES } from "@/lib/vehicle-types";
import { Plus, Trash2, CalendarDays } from "lucide-react";

type Option = { id: string; name: string; phone: string };

let daySeq = 0;

export type Day = {
  id: string;
  date: string;
  driverId: string;
  vehicleType: string;
  startPoint: string;
  endPoint: string;
  contractorPrice: string;
  driverDue: string;
  viaDriver: string;
};

function newDay(offset: number): Day {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return {
    id: `d${++daySeq}`,
    date: toDateInput(d),
    driverId: "",
    vehicleType: "",
    startPoint: "",
    endPoint: "",
    contractorPrice: "",
    driverDue: "",
    viaDriver: "",
  };
}

export function MultiDayTripForm({
  contractors,
  drivers,
  routes,
  initialContractorId,
}: {
  contractors: Option[];
  drivers: Option[];
  routes: RouteMemory[];
  initialContractorId?: string;
}) {
  const [contractorId, setContractorId] = useState(initialContractorId ?? "");
  const [days, setDays] = useState<Day[]>(() => [newDay(0), newDay(1)]);
  const [error, setError] = useState("");

  const newContractor = contractorId === "__new__";

  const totalContractor = days.reduce(
    (a, d) => a + toPiastres(d.contractorPrice || "0"),
    0
  );
  const totalDriver = days.reduce((a, d) => a + toPiastres(d.driverDue || "0"), 0);
  const totalProfit = totalContractor - totalDriver;

  const setDay = useCallback((i: number, patch: Partial<Day>) => {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }, []);

  /** يملأ سعر اليوم من ذاكرة المسارات بدون الكتابة فوق ما أدخله المستخدم */
  const fillDayPrice = useCallback(
    (i: number, contractor: string, driver: string) => {
      setDays((prev) =>
        prev.map((d, idx) =>
          idx === i
            ? {
                ...d,
                contractorPrice: d.contractorPrice || contractor,
                driverDue: d.driverDue || driver,
              }
            : d
        )
      );
    },
    []
  );

  const removeDay = useCallback((i: number) => {
    setDays((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  function addDay() {
    setDays((prev) => {
      const last = prev[prev.length - 1];
      const next = newDay(prev.length);
      // اليوم الجديد يرث نوع العربية والمسار من آخر يوم (قابل للتعديل)
      return [
        ...prev,
        last
          ? {
              ...next,
              vehicleType: last.vehicleType,
              startPoint: last.startPoint,
              endPoint: last.endPoint,
            }
          : next,
      ];
    });
  }

  async function action(formData: FormData) {
    setError("");
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (!d.driverId) return fail(`اختر سواق اليوم ${i + 1}`);
      if (!d.vehicleType) return fail(`اختر نوع العربية لليوم ${i + 1}`);
      if (!d.startPoint.trim() || !d.endPoint.trim())
        return fail(`اكتب نقطة البداية والنهاية لليوم ${i + 1}`);
    }
    formData.set("contractorId", contractorId);
    formData.set("days", JSON.stringify(days));
    try {
      const res = await createMultiDayTrip(formData);
      if (res?.error) {
        playSound("error");
        setError(res.error);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) {
        playSound("order");
        return;
      }
      playSound("error");
      setError("حصل خطأ غير متوقع، حاول تاني");
    }

    function fail(message: string) {
      setError(message);
      playSound("error");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <form action={action} className="space-y-4">
      {/* المقاول */}
      <Card className="space-y-3 p-4">
        <Label>المقاول *</Label>
        <SearchSelect
          value={contractorId}
          onChange={setContractorId}
          options={contractors}
          placeholder="اختر المقاول"
          newLabel="مقاول جديد"
        />
        {newContractor && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 p-3">
            <Input name="newContractorName" placeholder="اسم المقاول *" required />
            <Input
              name="newContractorPhone"
              placeholder="رقم الموبايل *"
              inputMode="tel"
              required
            />
            <Input name="newContractorCompany" placeholder="الشركة (اختياري)" />
          </div>
        )}
      </Card>

      {/* وصف مشترك لكل الأيام */}
      <Card className="space-y-1.5 p-4">
        <Label htmlFor="description">وصف الحجز</Label>
        <Textarea id="description" name="description" placeholder="اختياري" />
      </Card>

      {/* الأيام */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> أيام الرحلة ({days.length})
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addDay}>
          <Plus className="h-4 w-4" /> يوم
        </Button>
      </div>

      <div className="space-y-3">
        {days.map((d, i) => (
          <DayCard
            key={d.id}
            index={i}
            day={d}
            drivers={drivers}
            routes={routes}
            canRemove={days.length > 1}
            setDay={setDay}
            fillDayPrice={fillDayPrice}
            removeDay={removeDay}
          />
        ))}
      </div>

      {/* الإجماليات */}
      <Card className="space-y-2 border-2 border-primary/50 bg-primary/5 p-4">
        <Row label="إجمالي على المقاول" value={totalContractor} tone="text-foreground" />
        <Row label="إجمالي مستحقات السواقين" value={totalDriver} tone="text-warning" />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-bold">ربحك من الحجز</span>
          <span className="text-lg font-extrabold tabular-nums text-primary">
            {formatMoney(totalProfit)}
          </span>
        </div>
      </Card>

      {/* ملاحظة */}
      <Card className="space-y-1.5 p-4">
        <Label htmlFor="notes">ملاحظة</Label>
        <Textarea id="notes" name="notes" placeholder="أي تفاصيل (اختياري)" />
      </Card>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <SubmitButton
        size="lg"
        className="w-full"
        disabled={!contractorId || days.length === 0}
      >
        حفظ الحجز ({days.length} أيام)
      </SubmitButton>
    </form>
  );
}

function DayCard({
  index,
  day,
  drivers,
  routes,
  canRemove,
  setDay,
  fillDayPrice,
  removeDay,
}: {
  index: number;
  day: Day;
  drivers: Option[];
  routes: RouteMemory[];
  canRemove: boolean;
  setDay: (i: number, patch: Partial<Day>) => void;
  fillDayPrice: (i: number, contractor: string, driver: string) => void;
  removeDay: (i: number) => void;
}) {
  const onPickRoute = useCallback(
    (contractor: string, driver: string) => fillDayPrice(index, contractor, driver),
    [fillDayPrice, index]
  );
  const onRouteChange = useCallback(
    (startPoint: string, endPoint: string) => setDay(index, { startPoint, endPoint }),
    [setDay, index]
  );

  const profit =
    toPiastres(day.contractorPrice || "0") - toPiastres(day.driverDue || "0");

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary">اليوم {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeDay(index)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="حذف اليوم"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>التاريخ *</Label>
        <Input
          type="date"
          value={day.date}
          onChange={(e) => setDay(index, { date: e.target.value })}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>السواق *</Label>
        <SearchSelect
          value={day.driverId}
          onChange={(v) => setDay(index, { driverId: v })}
          options={drivers}
          placeholder="اختر السواق"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`day-${index}-vehicleType`}>نوع العربية *</Label>
        <Select
          value={day.vehicleType}
          onValueChange={(v) => setDay(index, { vehicleType: v })}
        >
          <SelectTrigger id={`day-${index}-vehicleType`}>
            <SelectValue placeholder="اختار نوع العربية" />
          </SelectTrigger>
          <SelectContent>
            {TRIP_VEHICLE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <RouteFields
        routes={routes}
        vehicleType={day.vehicleType}
        onPickRoute={onPickRoute}
        onRouteChange={onRouteChange}
        defaultStart={day.startPoint}
        defaultEnd={day.endPoint}
        idPrefix={`day-${index}-`}
        named={false}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>سعر المقاول *</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={day.contractorPrice}
            onChange={(e) => setDay(index, { contractorPrice: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>مستحق السواق *</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={day.driverDue}
            onChange={(e) => setDay(index, { driverDue: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>تحصيل عن طريق السواق</Label>
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          value={day.viaDriver}
          onChange={(e) => setDay(index, { viaDriver: e.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">
          اختياري. المبلغ اللي المقاول سلّمه للسواق في اليوم ده — يُخصم من مديونية
          المقاول ومن مستحق السواق، وأي زيادة تُسجّل سلفة على السواق.
        </p>
      </div>

      {(day.contractorPrice || day.driverDue) && (
        <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-xs">
          <span className="text-muted-foreground">ربح اليوم</span>
          <span
            className={`font-bold tabular-nums ${
              profit >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            {formatMoney(profit, false)}
          </span>
        </div>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums ${tone}`}>
        {formatMoney(value, false)}
      </span>
    </div>
  );
}
