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
    date?: boolean;
    contractorPrice?: boolean;
    driverDue?: boolean;
    newContractorName?: boolean;
    newContractorPhone?: boolean;
    newDriverName?: boolean;
    newDriverPhone?: boolean;
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
    const inv: {
      contractor?: boolean;
      vehicle?: boolean;
      driver?: boolean;
      date?: boolean;
      contractorPrice?: boolean;
      driverDue?: boolean;
      newContractorName?: boolean;
      newContractorPhone?: boolean;
      newDriverName?: boolean;
      newDriverPhone?: boolean;
    } = {};
    const missing: string[] = [];
    let first: string | null = null;

    const newContractorName = formData.get("newContractorName")?.toString().trim() ?? "";
    const newContractorPhone = formData.get("newContractorPhone")?.toString().trim() ?? "";
    const newDriverName = formData.get("newDriverName")?.toString().trim() ?? "";
    const newDriverPhone = formData.get("newDriverPhone")?.toString().trim() ?? "";

    if (!contractorId) {
      inv.contractor = true;
      missing.push("المقاول");
      first = first ?? "field-contractor";
    } else if (newContractor) {
      if (!newContractorName) {
        inv.newContractorName = true;
        missing.push("اسم المقاول");
        first = first ?? "newContractorName";
      }
      if (!newContractorPhone) {
        inv.newContractorPhone = true;
        missing.push("رقم الموبايل للمقاول");
        first = first ?? "newContractorPhone";
      }
    }

    if (!vehicleType) {
      inv.vehicle = true;
      missing.push("نوع العربية");
      first = first ?? "field-vehicle";
    }

    if (!driverId) {
      inv.driver = true;
      missing.push("السواق");
      first = first ?? "field-driver";
    } else if (newDriver) {
      if (!newDriverName) {
        inv.newDriverName = true;
        missing.push("اسم السواق");
        first = first ?? "newDriverName";
      }
      if (!newDriverPhone) {
        inv.newDriverPhone = true;
        missing.push("رقم الموبايل للسواق");
        first = first ?? "newDriverPhone";
      }
    }

    if (!tripDate) {
      inv.date = true;
      missing.push("التاريخ");
      first = first ?? "date";
    }

    if (!contractorPrice.trim()) {
      inv.contractorPrice = true;
      missing.push("سعر المقاول");
      first = first ?? "contractorPrice";
    }

    if (!driverDue.trim()) {
      inv.driverDue = true;
      missing.push("مستحق السواق");
      first = first ?? "driverDue";
    }

    setInvalid(inv);
    if (missing.length > 0) {
      setError(`برجاء تعبئة الحقول المطلوبة: ${missing.join("، ")}`);
      playSound("error");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    formData.set("contractorId", contractorId);
    formData.set("driverId", driverId);
    formData.set("contractorPrice", contractorPrice.trim());
    formData.set("driverDue", driverDue.trim());
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
        <Label className={invalid.contractor ? "text-destructive" : ""}>المقاول *</Label>
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
            <Input
              id="newContractorName"
              name="newContractorName"
              placeholder="اسم المقاول *"
              required
              className={invalid.newContractorName ? "border-destructive ring-1 ring-destructive" : ""}
              onChange={() => setInvalid((p) => ({ ...p, newContractorName: false }))}
            />
            <Input
              id="newContractorPhone"
              name="newContractorPhone"
              placeholder="رقم الموبايل *"
              inputMode="tel"
              required
              className={invalid.newContractorPhone ? "border-destructive ring-1 ring-destructive" : ""}
              onChange={() => setInvalid((p) => ({ ...p, newContractorPhone: false }))}
            />
            <Input name="newContractorCompany" placeholder="الشركة (اختياري)" />
          </div>
        )}
      </Card>

      {/* السواق */}
      <Card id="field-driver" className="space-y-3 p-4">
        <Label className={invalid.driver ? "text-destructive" : ""}>السواق *</Label>
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
            <Input
              id="newDriverName"
              name="newDriverName"
              placeholder="اسم السواق *"
              required
              className={invalid.newDriverName ? "border-destructive ring-1 ring-destructive" : ""}
              onChange={() => setInvalid((p) => ({ ...p, newDriverName: false }))}
            />
            <Input
              id="newDriverPhone"
              name="newDriverPhone"
              placeholder="رقم الموبايل *"
              inputMode="tel"
              required
              className={invalid.newDriverPhone ? "border-destructive ring-1 ring-destructive" : ""}
              onChange={() => setInvalid((p) => ({ ...p, newDriverPhone: false }))}
            />
            <Input name="newDriverVehicleType" placeholder="نوع السيارة" />
          </div>
        )}
      </Card>

      {/* تفاصيل الرحلة */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date" className={invalid.date ? "text-destructive" : ""}>التاريخ *</Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={tripDate}
              onChange={(e) => {
                setTripDate(e.target.value);
                setInvalid((p) => ({ ...p, date: false }));
                setError("");
              }}
              required
              className={invalid.date ? "border-destructive ring-1 ring-destructive" : ""}
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
          <Label htmlFor="vehicleType" className={invalid.vehicle ? "text-destructive" : ""}>نوع العربية *</Label>
          <Select
            name="vehicleType"
            value={vehicleType}
            onValueChange={(v) => {
              setVehicleType(v);
              setInvalid((p) => ({ ...p, vehicle: false }));
              setError("");
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
          <Label htmlFor="contractorPrice" className={invalid.contractorPrice ? "text-destructive" : ""}>سعر المقاول *</Label>
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
              setInvalid((p) => ({ ...p, contractorPrice: false }));
              setError("");
            }}
            required
            className={invalid.contractorPrice ? "border-destructive ring-1 ring-destructive" : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="driverDue" className={invalid.driverDue ? "text-destructive" : ""}>مستحق السواق *</Label>
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
              setInvalid((p) => ({ ...p, driverDue: false }));
              setError("");
            }}
            required
            className={invalid.driverDue ? "border-destructive ring-1 ring-destructive" : ""}
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
