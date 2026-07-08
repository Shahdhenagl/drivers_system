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
import { recordDriverTip } from "@/lib/extra-profit-actions";
import { playSound } from "@/lib/sounds";
import { toDateInput } from "@/lib/format";
import { Gift } from "lucide-react";

export function DriverTipForm({ driverId }: { driverId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function action(formData: FormData) {
    setError("");
    try {
      const res = await recordDriverTip(driverId, formData);
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
        <Button variant="outline" size="lg" className="w-full">
          <Gift className="h-5 w-5" /> إكرامية للسواق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إكرامية للسواق</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
          مبلغ إضافي يُعطى للسواق ويُخصم من ربح المكتب. يخرج من الخزنة (أو من أمانة
          المحصّل لو اخترت محصّل).
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
              inputMode="decimal"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الصرف</Label>
            <MethodSelect withCollectors />
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
            <Textarea id="note" name="note" placeholder="سبب الإكرامية (اختياري)" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton size="lg" className="w-full">
            تأكيد الإكرامية
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
