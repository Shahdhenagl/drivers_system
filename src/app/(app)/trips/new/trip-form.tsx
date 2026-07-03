"use client";

import { useState } from "react";
import { SearchSelect } from "@/components/ui/search-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { createTrip } from "../actions";
import { playSound } from "@/lib/sounds";
import { toDateInput } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
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
}: {
  contractors: Option[];
  drivers: Option[];
}) {
  const [contractorId, setContractorId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [tripDate, setTripDate] = useState(() => toDateInput(new Date()));
  const [error, setError] = useState("");

  const selectedContractor = contractors.find((c) => c.id === contractorId);
  const newContractor = contractorId === "__new__";
  const newDriver = driverId === "__new__";
  const tripDay = weekdayFromDateInput(tripDate);

  async function action(formData: FormData) {
    setError("");
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
      <Card className="space-y-3 p-4">
        <Label>المقاول *</Label>
        <SearchSelect
          value={contractorId}
          onChange={setContractorId}
          options={contractors}
          placeholder="اختر المقاول"
          newLabel="مقاول جديد"
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
        <div className="space-y-1.5">
          <Label htmlFor="startPoint">نقطة البداية *</Label>
          <Input id="startPoint" name="startPoint" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endPoint">نقطة النهاية *</Label>
          <Input id="endPoint" name="endPoint" required />
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
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="driverTip">زيادة للسواق</Label>
          <Input
            id="driverTip"
            name="driverTip"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            تزيد ما يقبضه السواق وتُخصم من ربحك
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customerDiscount">خصم للمقاول</Label>
          <Input
            id="customerDiscount"
            name="customerDiscount"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            يقلّل سعر المقاول ويُخصم من ربحك
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contractorSurcharge">زيادة على المقاول</Label>
          <Input
            id="contractorSurcharge"
            name="contractorSurcharge"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            تزيد سعر المقاول وتزيد ربحك
          </p>
        </div>
      </Card>

      {/* السواق */}
      <Card className="space-y-3 p-4">
        <Label>السواق *</Label>
        <SearchSelect
          value={driverId}
          onChange={setDriverId}
          options={drivers}
          placeholder="اختر السواق"
          newLabel="سواق جديد"
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

      {error && (
        <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <SubmitButton size="lg" className="w-full" disabled={!contractorId || !driverId}>
        حفظ الطلب
      </SubmitButton>
    </form>
  );
}
