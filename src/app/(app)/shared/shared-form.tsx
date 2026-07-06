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
import { createShared, updateShared } from "./actions";

export type SharedData = {
  linkId: string;
  name: string;
  phone: string;
  altPhone: string | null;
  phone3: string | null;
  company: string | null;
  vehicleType: string;
  vehicleNumber: string | null;
  notes: string | null;
};

export function SharedForm({
  shared,
  trigger,
}: {
  shared?: SharedData;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shared?.name ?? "");
  const [phone, setPhone] = useState(shared?.phone ?? "");
  const [altPhone, setAltPhone] = useState(shared?.altPhone ?? "");
  const [phone3, setPhone3] = useState(shared?.phone3 ?? "");
  const router = useRouter();
  const isEdit = !!shared;

  async function action(formData: FormData) {
    if (isEdit) await updateShared(shared!.linkId, formData);
    else await createShared(formData);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "تعديل مشترك" : "مشترك جديد (سواق ومقاول)"}
          </DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          {!isEdit && (
            <div className="flex justify-center pb-1">
              <ContactPickerAvatar
                onPick={(n, phones) => {
                  if (n) setName(n);
                  if (phones[0]) setPhone(phones[0]);
                  if (phones[1]) setAltPhone(phones[1]);
                  if (phones[2]) setPhone3(phones[2]);
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
            <Label htmlFor="altPhone">رقم إضافي 2 (اختياري)</Label>
            <Input
              id="altPhone"
              name="altPhone"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              value={altPhone}
              onChange={(e) => setAltPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone3">رقم إضافي 3 (اختياري)</Label>
            <Input
              id="phone3"
              name="phone3"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              value={phone3}
              onChange={(e) => setPhone3(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehicleType">نوع السيارة *</Label>
              <Input
                id="vehicleType"
                name="vehicleType"
                placeholder="نقل / ربع نقل..."
                defaultValue={shared?.vehicleType}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleNumber">رقم السيارة</Label>
              <Input
                id="vehicleNumber"
                name="vehicleNumber"
                defaultValue={shared?.vehicleNumber ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">الشركة (اختياري)</Label>
            <Input id="company" name="company" defaultValue={shared?.company ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea id="notes" name="notes" defaultValue={shared?.notes ?? ""} />
          </div>
          <SubmitButton size="lg" className="w-full">
            {isEdit ? "حفظ التعديلات" : "إضافة المشترك"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
