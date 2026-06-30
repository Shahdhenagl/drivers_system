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
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { payDriverDues } from "./actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { HandCoins } from "lucide-react";

export function PayDriverForm({
  driverId,
  remaining,
}: {
  driverId: string;
  remaining: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function action(formData: FormData) {
    setError("");
    try {
      const res = await payDriverDues(driverId, formData);
      if (res?.error) {
        playSound("error");
        setError(res.error);
        return;
      }
      playSound("money");
      setOpen(false);
      router.refresh();
    } catch {
      playSound("error");
      setError("حصل خطأ غير متوقع، حاول تاني");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full" disabled={remaining <= 0}>
          <HandCoins className="h-5 w-5" />
          سداد مستحقات
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سداد مستحقات السواق</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          المتبقي للسواق:{" "}
          <span className="font-bold text-warning">{formatMoney(remaining)}</span>
        </p>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">القيمة (ج.م) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              max={toEgp(remaining)}
              inputMode="decimal"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={toDateInput(new Date())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton size="lg" className="w-full">
            تأكيد السداد
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
