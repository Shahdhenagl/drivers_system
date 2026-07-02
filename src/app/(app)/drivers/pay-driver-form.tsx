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
import { payDriverDues, offsetDriverAdvance } from "./actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toPiastres } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { HandCoins, Scissors } from "lucide-react";

export function PayDriverForm({
  driverId,
  remaining,
  advanceBalance = 0,
}: {
  driverId: string;
  remaining: number;
  advanceBalance?: number; // + = عليه سلفة لنا، − = له علينا
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [amountEgp, setAmountEgp] = useState("");
  const router = useRouter();

  const amountP = toPiastres(amountEgp || "0");
  const duePortion = Math.min(amountP, remaining);
  const advancePortion = Math.max(amountP - remaining, 0);

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
      setAmountEgp("");
      router.refresh();
    } catch {
      playSound("error");
      setError("حصل خطأ غير متوقع، حاول تاني");
    }
  }

  async function doOffset() {
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full" disabled={remaining <= 0 && advanceBalance <= 0}>
          <HandCoins className="h-5 w-5" />
          سداد / حساب السواق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سداد مستحقات السواق</DialogTitle>
        </DialogHeader>

        <div className="mb-3 space-y-1 rounded-lg bg-muted p-2 text-center text-sm">
          <div>
            المتبقي للسواق:{" "}
            <span className="font-bold text-warning">{formatMoney(remaining)}</span>
          </div>
          {advanceBalance > 0 && (
            <div className="text-xs">
              عليه سلفة:{" "}
              <span className="font-bold text-destructive">
                {formatMoney(advanceBalance)}
              </span>
            </div>
          )}
          {advanceBalance < 0 && (
            <div className="text-xs">
              له علينا:{" "}
              <span className="font-bold text-success">
                {formatMoney(-advanceBalance)}
              </span>
            </div>
          )}
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
            {advancePortion > 0 && (
              <p className="text-xs text-warning">
                منها {formatMoney(duePortion, false)} سداد مشاوير و{" "}
                {formatMoney(advancePortion, false)} سلفة جديدة عليه.
              </p>
            )}
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
