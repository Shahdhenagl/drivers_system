"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { createTrip } from "../actions";
import { playSound } from "@/lib/sounds";
import { toDateInput } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { UserPlus, History } from "lucide-react";
import Link from "next/link";

type Option = { id: string; name: string; phone: string };

export function TripForm({
  contractors,
  drivers,
}: {
  contractors: Option[];
  drivers: Option[];
}) {
  const [contractorId, setContractorId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [error, setError] = useState("");

  const selectedContractor = contractors.find((c) => c.id === contractorId);
  const newContractor = contractorId === "__new__";
  const newDriver = driverId === "__new__";

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
        <Select value={contractorId} onValueChange={setContractorId}>
          <SelectTrigger>
            <SelectValue placeholder="اختر المقاول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__">
              <span className="flex items-center gap-2 text-primary">
                <UserPlus className="h-4 w-4" /> مقاول جديد
              </span>
            </SelectItem>
            {contractors.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} — {displayPhone(c.phone)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              defaultValue={toDateInput(new Date())}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time">الوقت</Label>
            <Input id="time" name="time" type="time" />
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
          <Label htmlFor="driverTip">اكرامية للسواق</Label>
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
          <Label htmlFor="customerDiscount">خصم على العميل</Label>
          <Input
            id="customerDiscount"
            name="customerDiscount"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            يقلّل سعر العميل ويُخصم من ربحك
          </p>
        </div>
      </Card>

      {/* السواق */}
      <Card className="space-y-3 p-4">
        <Label>السواق *</Label>
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger>
            <SelectValue placeholder="اختر السواق" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__">
              <span className="flex items-center gap-2 text-primary">
                <UserPlus className="h-4 w-4" /> سواق جديد
              </span>
            </SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} — {displayPhone(d.phone)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
