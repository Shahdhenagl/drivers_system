"use client";

import { useCallback, useState } from "react";
import { SearchSelect } from "@/components/ui/search-select";
import { RouteFields, type RouteMemory } from "@/components/route-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { createTrip } from "../actions";
import { playSound } from "@/lib/sounds";
import { toDateInput } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { TRIP_VEHICLE_TYPES } from "@/lib/vehicle-types";
import { History } from "lucide-react";
import Link from "next/link";

type Option = { id: string; name: string; phone: string };

function weekdayFromDateInput(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(
    new Date(`${value}T12:00:00`)
  );
}

export function TripForm({
  contractors,
  drivers,
  routes,
  initialContractorId,
  initialDriverId,
}: {
  contractors: Option[];
  drivers: Option[];
  routes: RouteMemory[];
  initialContractorId?: string;
  initialDriverId?: string;
}) {
  const [contractorId, setContractorId] = useState<string>(
    initialContractorId ?? ""
  );
  const [driverId, setDriverId] = useState<string>(initialDriverId ?? "");
  const [tripDate, setTripDate] = useState(() => toDateInput(new Date()));
  const [vehicleType, setVehicleType] = useState("");
  const [contractorPrice, setContractorPrice] = useState("");
  const [driverDue, setDriverDue] = useState("");
  const [contractorPriceTouched, setContractorPriceTouched] = useState(false);
  const [driverDueTouched, setDriverDueTouched] = useState(false);
  const [invalid, setInvalid] = useState<{
    contractor?: boolean;
    vehicle?: boolean;
    driver?: boolean;
  }>({});
  const [error, setError] = useState("");

  const selectedContractor = contractors.find((c) => c.id === contractorId);
  const newContractor = contractorId === "__new__";
  const newDriver = driverId === "__new__";
  const tripDay = weekdayFromDateInput(tripDate);

  const applyRoutePrice = useCallback(
    (contractor: string, driver: string) => {
      if (!contractorPriceTouched) setContractorPrice(contractor);
      if (!driverDueTouched) setDriverDue(driver);
    },
    [contractorPriceTouched, driverDueTouched]
  );

  async function action(formData: FormData) {
    setError("");
    // تحقق الحقول الإجبارية غير النصّية (المقاول/نوع العربية/السواق)
    const inv: { contractor?: boolean; vehicle?: boolean; driver?: boolean } = {};
    let first: string | null = null;
    if (!contractorId) {
      inv.contractor = true;
      first = first ?? "field-contractor";
    }
    if (!vehicleType) {
      inv.vehicle = true;
      first = first ?? "field-vehicle";
    }
    if (!driverId) {
      inv.driver = true;
      first = first ?? "field-driver";
    }
    setInvalid(inv);
    if (first) {
      playSound("error");
      document
        .getElementById(first)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    formData.set("contractorId", contractorId);
    formData.set("driverId", driverId);
    try {
      const res = await createTrip(formData);
      // لو رجع خطأ تحقّق (بيانات ناقصة)
      if (res?.error) {
        playSound("error");
        setError(res.error);
      }
    } catch (e) {
      // نجاح الحفظ يرمي NEXT_REDIRECT — هنا نشغّل صوت الطلب الجديد المميز
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
      <Card id="field-contractor" className="space-y-3 p-4">
        <Label>المقاول *</Label>
        <SearchSelect
          value={contractorId}
          onChange={(v) => {
            setContractorId(v);
            setInvalid((p) => ({ ...p, contractor: false }));
          }}
          options={contractors}
          placeholder="اختر المقاول"
          newLabel="مقاول جديد"
          invalid={invalid.contractor}
        />

        {selectedContractor && (
          <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
            <span>{displayPhone(selectedContractor.phone)}</span>
            <Link
              href={`/contractors/${selectedContractor.id}`}
              className="flex items-center gap-1 text-primary"
            >
              <History className="h-4 w-4" /> عرض التاريخ
            </Link>
          </div>
        )}

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

      {/* السواق */}
      <Card id="field-driver" className="space-y-3 p-4">
        <Label>السواق *</Label>
        <SearchSelect
          value={driverId}
          onChange={(v) => {
            setDriverId(v);
            setInvalid((p) => ({ ...p, driver: false }));
          }}
          options={drivers}
          placeholder="اختر السواق"
          newLabel="سواق جديد"
          invalid={invalid.driver}
        />

        {newDriver && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 p-3">
            <Input name="newDriverName" placeholder="اسم السواق *" required />
            <Input
              name="newDriverPhone"
              placeholder="رقم الموبايل *"
              inputMode="tel"
              required
            />
            <Input name="newDriverVehicleType" placeholder="نوع السيارة" />
          </div>
        )}
      </Card>

      {/* تفاصيل الرحلة */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ *</Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="day">اليوم</Label>
            <Input id="day" value={tripDay} readOnly className="bg-muted" />
            <input type="hidden" name="time" value={tripDay} />
          </div>
        </div>
        <RouteFields
          routes={routes}
          vehicleType={vehicleType}
          onPickRoute={applyRoutePrice}
        />
        <div id="field-vehicle" className="space-y-1.5">
          <Label htmlFor="vehicleType">نوع العربية *</Label>
          <Select
            name="vehicleType"
            value={vehicleType}
            onValueChange={(v) => {
              setVehicleType(v);
              setInvalid((p) => ({ ...p, vehicle: false }));
            }}
          >
            <SelectTrigger
              id="vehicleType"
              className={
                invalid.vehicle ? "border-destructive ring-1 ring-destructive" : ""
              }
            >
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
        <div className="space-y-1.5">
          <Label htmlFor="distance">المسافة (كم) — اختياري</Label>
          <Input id="distance" name="distance" type="number" step="0.1" inputMode="decimal" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">ملاحظة</Label>
          <Textarea id="notes" name="notes" placeholder="أي تفاصيل تحب تحفظها مع الطلب (اختياري)" />
        </div>
      </Card>

      {/* المالية */}
      <Card className="grid grid-cols-2 gap-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="contractorPrice">سعر المقاول *</Label>
          <Input
            id="contractorPrice"
            name="contractorPrice"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={contractorPrice}
            onChange={(e) => {
              setContractorPriceTouched(true);
              setContractorPrice(e.target.value);
            }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="driverDue">مستحق السواق *</Label>
          <Input
            id="driverDue"
            name="driverDue"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={driverDue}
            onChange={(e) => {
              setDriverDueTouched(true);
              setDriverDue(e.target.value);
            }}
            required
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="contractorToDriver">سداد من المقاول للسواق</Label>
          <Input
            id="contractorToDriver"
            name="contractorToDriver"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            اختياري. يُسجّل كتحصيل من المقاول وسداد للسواق، وأي زيادة عن التسوية تُسجّل سلفة على السواق.
          </p>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <SubmitButton size="lg" className="w-full">
        حفظ الطلب
      </SubmitButton>
    </form>
  );
}
