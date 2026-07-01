"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { ContactPickerAvatar } from "@/components/contact-picker";
import { createDriver, updateDriver } from "./actions";

type Driver = {
  id: string;
  name: string;
  phone: string;
  altPhone: string | null;
  vehicleType: string;
  vehicleNumber: string | null;
  notes: string | null;
};

export function DriverForm({
  driver,
  trigger,
}: {
  driver?: Driver;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(driver?.name ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const router = useRouter();
  const isEdit = !!driver;

  async function action(formData: FormData) {
    if (isEdit) await updateDriver(driver!.id, formData);
    else await createDriver(formData);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل سواق" : "سواق جديد"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          {!isEdit && (
            <div className="flex justify-center pb-1">
              <ContactPickerAvatar
                onPick={(n, p) => {
                  if (n) setName(n);
                  if (p) setPhone(p);
                }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">الاسم *</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الموبايل *</Label>
            <Input
              id="phone"
              name="phone"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="altPhone">رقم إضافي (اختياري)</Label>
            <Input
              id="altPhone"
              name="altPhone"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              defaultValue={driver?.altPhone ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehicleType">نوع السيارة *</Label>
              <Input
                id="vehicleType"
                name="vehicleType"
                placeholder="نقل / ربع نقل..."
                defaultValue={driver?.vehicleType}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleNumber">رقم السيارة</Label>
              <Input
                id="vehicleNumber"
                name="vehicleNumber"
                defaultValue={driver?.vehicleNumber ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea id="notes" name="notes" defaultValue={driver?.notes ?? ""} />
          </div>
          <SubmitButton size="lg" className="w-full">
            {isEdit ? "حفظ التعديلات" : "إضافة السواق"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
