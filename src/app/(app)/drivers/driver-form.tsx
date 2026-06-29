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
import { createDriver, updateDriver } from "./actions";

type Driver = {
  id: string;
  name: string;
  phone: string;
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
          <div className="space-y-1.5">
            <Label htmlFor="name">الاسم *</Label>
            <Input id="name" name="name" defaultValue={driver?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الموبايل *</Label>
            <Input
              id="phone"
              name="phone"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              defaultValue={driver?.phone}
              required
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
