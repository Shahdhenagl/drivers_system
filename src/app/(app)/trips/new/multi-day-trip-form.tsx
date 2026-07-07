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

type Day = {
  date: string;
  driverId: string;
  contractorPrice: string;
  driverDue: string;
};

function newDay(offset: number): Day {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return { date: toDateInput(d), driverId: "", contractorPrice: "", driverDue: "" };
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
  const [vehicleType, setVehicleType] = useState("");
  const [days, setDays] = useState<Day[]>([newDay(0), newDay(1)]);
  const [error, setError] = useState("");

  const newContractor = contractorId === "__new__";

  const totalContractor = days.reduce(
    (a, d) => a + toPiastres(d.contractorPrice || "0"),
    0
  );
  const totalDriver = days.reduce((a, d) => a + toPiastres(d.driverDue || "0"), 0);
  const totalProfit = totalContractor - totalDriver;

  function setDay(i: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function addDay() {
    setDays((prev) => [...prev, newDay(prev.length)]);
  }
  function removeDay(i: number) {
    setDays((prev) => prev.filter((_, idx) => idx !== i));
  }

  const applyRoutePrice = useCallback((contractor: string, driver: string) => {
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        contractorPrice: day.contractorPrice || contractor,
        driverDue: day.driverDue || driver,
      }))
    );
  }, []);

  async function action(formData: FormData) {
    setError("");
    if (days.some((d) => !d.driverId)) {
      setError("اختر سواق لكل يوم");
      playSound("error");
      return;
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

      {/* المسار المشترك */}
      <Card className="space-y-3 p-4">
        <RouteFields
          routes={routes}
          vehicleType={vehicleType}
          onPickRoute={applyRoutePrice}
        />
        <div className="space-y-1.5">
          <Label htmlFor="vehicleType">نوع العربية *</Label>
          <Select name="vehicleType" value={vehicleType} onValueChange={setVehicleType} required>
            <SelectTrigger id="vehicleType">
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
        <div className="space-y-1.5">
          <Label htmlFor="description">وصف الرحلة</Label>
          <Textarea id="description" name="description" />
        </div>
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
        {days.map((d, i) => {
          const profit =
            toPiastres(d.contractorPrice || "0") - toPiastres(d.driverDue || "0");
          return (
            <Card key={i} className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">
                  اليوم {i + 1}
                </span>
                {days.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDay(i)}
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
                  value={d.date}
                  onChange={(e) => setDay(i, { date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>السواق *</Label>
                <SearchSelect
                  value={d.driverId}
                  onChange={(v) => setDay(i, { driverId: v })}
                  options={drivers}
                  placeholder="اختر السواق"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>سعر المقاول *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={d.contractorPrice}
                    onChange={(e) => setDay(i, { contractorPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>مستحق السواق *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={d.driverDue}
                    onChange={(e) => setDay(i, { driverDue: e.target.value })}
                    required
                  />
                </div>
              </div>
              {(d.contractorPrice || d.driverDue) && (
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
        })}
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
