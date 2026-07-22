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
import { payDriverDues, offsetDriverAdvance } from "./actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toPiastres, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { HandCoins, Scissors } from "lucide-react";

export function PayDriverForm({
  driverId,
  remaining,
  advanceBalance = 0,
  externalCredit = 0,
  externalDebt = 0,
}: {
  driverId: string;
  remaining: number;
  advanceBalance?: number; // + = عليه سلفة لنا، − = له علينا
  externalCredit?: number; // باقي سلف خارجية له (يستلمها من المكتب)
  externalDebt?: number; // باقي سلف خارجية عليه (يدفعها للمكتب)
}) {
  const advanceDebt = Math.max(advanceBalance, 0);
  const advanceCredit = Math.max(-advanceBalance, 0);
  // صافي الحساب = كل اللي له (رحلات + رصيد مكتب + سلف خارجية له)
  //               ناقص كل اللي عليه (سلف مكتب + سلف خارجية عليه)
  const net =
    remaining + advanceCredit + externalCredit - advanceDebt - externalDebt;
  const suggested = Math.max(net, 0);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [amountEgp, setAmountEgp] = useState(
    suggested > 0 ? String(toEgp(suggested)) : ""
  );
  const submitting = useRef(false);
  const router = useRouter();

  const amountP = toPiastres(amountEgp || "0");
  const payable = remaining + externalCredit;
  const duePortion = Math.min(amountP, payable);
  const advancePortion = Math.max(amountP - payable, 0);

  async function action(formData: FormData) {
    if (submitting.current) return; // منع الضغط المزدوج
    submitting.current = true;
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
    } finally {
      submitting.current = false;
    }
  }

  async function doOffset() {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      const res = await offsetDriverAdvance(driverId);
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
          <HandCoins className="h-5 w-5" />
          سداد / حساب السواق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سداد مستحقات السواق</DialogTitle>
        </DialogHeader>

        <div className="mb-3 space-y-1 rounded-lg bg-muted p-2 text-sm">
          <div className="flex items-center justify-between">
            <span>متبقي رحلات له</span>
            <span className="font-bold text-warning">{formatMoney(remaining)}</span>
          </div>
          {advanceDebt > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف عليه</span>
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
          {externalCredit > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف خارجية له</span>
              <span className="font-bold text-success">
                {formatMoney(externalCredit)}
              </span>
            </div>
          )}
          {externalDebt > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span>سلف خارجية عليه (تُخصم)</span>
              <span className="font-bold text-destructive">
                − {formatMoney(externalDebt)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-1 font-bold">
            <span>صافي الحساب</span>
            <span className={net >= 0 ? "text-success" : "text-destructive"}>
              {net > 0
                ? `له ${formatMoney(net)}`
                : net < 0
                  ? `عليه ${formatMoney(-net)}`
                  : formatMoney(0)}
            </span>
          </div>
        </div>

        {/* خصم السلفة من مستحقاته (بدون نقدية) */}
        {advanceBalance > 0 && remaining > 0 && (
          <Button
            type="button"
            variant="outline"
            className="mb-3 w-full"
            onClick={doOffset}
          >
            <Scissors className="h-4 w-4" /> خصم سلفته من مستحقاته
            {" "}({formatMoney(Math.min(remaining, advanceBalance), false)})
          </Button>
        )}

        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">المبلغ المُسلَّم للسواق (ج.م) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              autoFocus
              value={amountEgp}
              onChange={(e) => setAmountEgp(e.target.value)}
            />
            {amountP > 0 && (
              <div className="rounded-lg bg-muted/70 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span>منه سداد رحلات وسلف خارجية له</span>
                  <span className="font-semibold">
                    {formatMoney(duePortion, false)}
                  </span>
                </div>
                {advancePortion > 0 && (
                  <div className="flex items-center justify-between text-warning">
                    <span>زيادة هتتحسب سلفة عليه</span>
                    <span className="font-semibold">
                      {formatMoney(advancePortion, false)}
                    </span>
                  </div>
                )}
              </div>
            )}
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
