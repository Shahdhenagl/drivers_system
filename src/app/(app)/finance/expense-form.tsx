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
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { addExpense } from "./actions";
import { playSound } from "@/lib/sounds";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { Plus } from "lucide-react";

export function ExpenseForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      await addExpense(fd);
      playSound("money");
      setOpen(false);
      router.refresh();
    } catch (e) {
      playSound("error");
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> مصروف
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مصروف</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم المصروف *</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">القيمة (ج.م) *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>الفئة</Label>
              <Select name="category" defaultValue="عام">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea id="notes" name="notes" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            حفظ المصروف
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
