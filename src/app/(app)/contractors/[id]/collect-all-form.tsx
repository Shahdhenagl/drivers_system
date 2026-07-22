"use client";

import { useRef, useState } from "react";
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
  externalCredit = 0,
  externalDebt = 0,
}: {
  contractorId: string;
  remaining: number;
  advanceBalance?: number;
  externalCredit?: number; // باقي سلف خارجية له (نحن ندين له)
  externalDebt?: number; // باقي سلف خارجية عليه (يدفعها للمكتب)
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const router = useRouter();
  const advanceDebt = Math.max(advanceBalance, 0);
  const advanceCredit = Math.max(-advanceBalance, 0);
  // صافي الحساب = كل اللي عليه (رحلات + سلف مكتب + سلف خارجية عليه)
  //               ناقص كل اللي له (رصيد مكتب + سلف خارجية له)
  const net =
    remaining + advanceDebt + externalDebt - advanceCredit - externalCredit;
  // المطلوب للتحصيل = الصافي (الزرار يقاصّ الباقي بدون كاش ويقفل الحساب على صفر)
  const collectable = Math.max(net, 0);

  async function action(formData: FormData) {
    if (submitting.current) return; // منع الضغط المزدوج
    submitting.current = true;
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
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full">
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
          {externalDebt > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف خارجية عليه</span>
              <span className="font-bold text-destructive">
                {formatMoney(externalDebt)}
              </span>
            </div>
          )}
          {externalCredit > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف خارجية له (تُخصم)</span>
              <span className="font-bold text-success">
                − {formatMoney(externalCredit)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-1 font-bold">
            <span>المطلوب للتحصيل</span>
            <span className="text-destructive">{formatMoney(collectable)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
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
          القيمة الافتراضية = صافي الحساب. الزرار يقاصّ اللي له مع اللي عليه بدون
          كاش، وبعدين يوزّع المبلغ بالأقدم أولًا على آجل الرحلات ثم السلف الخارجية
          عليه، وأي زيادة تتسجّل رصيدًا له عندنا.
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
