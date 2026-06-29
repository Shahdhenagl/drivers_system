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
import { createContractor, updateContractor } from "./actions";

type Contractor = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  notes: string | null;
};

export function ContractorForm({
  contractor,
  trigger,
}: {
  contractor?: Contractor;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = !!contractor;

  async function action(formData: FormData) {
    if (isEdit) await updateContractor(contractor!.id, formData);
    else await createContractor(formData);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل مقاول" : "مقاول جديد"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">الاسم *</Label>
            <Input id="name" name="name" defaultValue={contractor?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الموبايل *</Label>
            <Input
              id="phone"
              name="phone"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              defaultValue={contractor?.phone}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">الشركة (اختياري)</Label>
            <Input
              id="company"
              name="company"
              defaultValue={contractor?.company ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={contractor?.notes ?? ""}
            />
          </div>
          <SubmitButton size="lg" className="w-full">
            {isEdit ? "حفظ التعديلات" : "إضافة المقاول"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
