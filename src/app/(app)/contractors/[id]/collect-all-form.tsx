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
import { collectAllFromContractor } from "../actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { Banknote } from "lucide-react";

export function CollectAllForm({
  contractorId,
  remaining,
  advanceBalance = 0,
  externalCollectable = 0,
}: {
  contractorId: string;
  remaining: number;
  advanceBalance?: number;
  externalCollectable?: number; // سلف خارجية عليه يجمّعها المكتب (أمانة)
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const advanceDebt = Math.max(advanceBalance, 0);
  const advanceCredit = Math.max(-advanceBalance, 0);
  // المبلغ القابل للتحصيل تلقائيًا = متبقي الرحلات + السلف الخارجية عليه
  const collectable = remaining + externalCollectable;
  const totalOnContractor = collectable + advanceDebt;
  const net = totalOnContractor - advanceCredit;

  async function action(formData: FormData) {
    setError("");
    try {
      const res = await collectAllFromContractor(contractorId, formData);
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
        <Button size="lg" className="w-full" disabled={collectable <= 0}>
          <Banknote className="h-5 w-5" />
          تحصيل الكل
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تحصيل من المقاول</DialogTitle>
        </DialogHeader>
        <div className="mb-3 space-y-1 rounded-lg bg-muted p-2 text-sm">
          <div className="flex items-center justify-between">
            <span>متبقي رحلات عليه</span>
            <span className="font-bold text-destructive">
              {formatMoney(remaining)}
            </span>
          </div>
          {externalCollectable > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف خارجية عليه (أمانة يجمّعها المكتب)</span>
              <span className="font-bold text-destructive">
                {formatMoney(externalCollectable)}
              </span>
            </div>
          )}
          {advanceDebt > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف/رصيد عليه</span>
              <span className="font-bold text-destructive">
                {formatMoney(advanceDebt)}
              </span>
            </div>
          )}
          {advanceCredit > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>رصيد له عندنا</span>
              <span className="font-bold text-success">
                {formatMoney(advanceCredit)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-1 font-bold">
            <span>صافي الحساب</span>
            <span className={net >= 0 ? "text-destructive" : "text-success"}>
              {net > 0
                ? `عليه ${formatMoney(net)}`
                : net < 0
                  ? `له ${formatMoney(-net)}`
                  : formatMoney(0)}
            </span>
          </div>
        </div>
        <p className="mb-3 text-center text-xs text-muted-foreground">
          يتوزّع المبلغ بالأقدم أولًا على الرحلات والسلف الخارجية معًا. أي زيادة
          عن المستحق تتسجّل رصيدًا للمقاول (له عندنا).
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
              defaultValue={toEgp(collectable)}
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
            <Textarea id="note" name="note" placeholder="تفاصيل (اختياري)" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton size="lg" className="w-full">
            تأكيد التحصيل
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
