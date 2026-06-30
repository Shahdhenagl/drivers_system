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
import { SubmitButton } from "@/components/submit-button";
import { createPartner, updatePartner } from "./actions";
import { playSound } from "@/lib/sounds";

type Partner = {
  id: string;
  name: string;
  sharePercent: number;
  phone: string | null;
};

export function PartnerForm({
  partner,
  trigger,
}: {
  partner?: Partner;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const isEdit = !!partner;

  async function action(fd: FormData) {
    setErr("");
    try {
      if (isEdit) await updatePartner(partner!.id, fd);
      else await createPartner(fd);
      playSound(isEdit ? "success" : "order");
      setOpen(false);
      router.refresh();
    } catch (e) {
      playSound("error");
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل شريك" : "شريك جديد"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">الاسم *</Label>
            <Input id="name" name="name" defaultValue={partner?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sharePercent">نسبة المشاركة (%) *</Label>
            <Input
              id="sharePercent"
              name="sharePercent"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={partner?.sharePercent}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الهاتف</Label>
            <Input
              id="phone"
              name="phone"
              inputMode="tel"
              defaultValue={partner?.phone ?? ""}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            {isEdit ? "حفظ" : "إضافة الشريك"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
