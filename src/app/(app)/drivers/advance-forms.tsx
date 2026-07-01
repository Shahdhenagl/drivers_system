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
import { addDriverAdvance, repayDriverAdvance } from "./actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { HandCoins, Wallet } from "lucide-react";

/** صرف سلفة جديدة لسواق */
export function AdvanceForm({ driverId }: { driverId: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [fallbackFd, setFallbackFd] = useState<FormData | null>(null);
  const router = useRouter();

  async function run(fd: FormData) {
    try {
      const res = await addDriverAdvance(driverId, fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        setFallbackFd("canFallback" in res && res.canFallback ? fd : null);
        return;
      }
      playSound("money");
      setOpen(false);
      router.refresh();
    } catch {
      playSound("error");
      setErr("حصل خطأ غير متوقع، حاول تاني");
      setFallbackFd(null);
    }
  }

  async function action(fd: FormData) {
    setErr("");
    setFallbackFd(null);
    await run(fd);
  }

  async function confirmFallback() {
    if (!fallbackFd) return;
    fallbackFd.set("fallback", "1");
    setErr("");
    const fd = fallbackFd;
    setFallbackFd(null);
    await run(fd);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full">
          <Wallet className="h-5 w-5" /> صرف سلفة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صرف سلفة للسواق</DialogTitle>
        </DialogHeader>
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
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" placeholder="سبب السلفة (اختياري)" />
          </div>
          {err && (
            <div className="space-y-2 rounded-lg bg-destructive/10 p-2">
              <p className="text-sm text-destructive">{err}</p>
              {fallbackFd && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={confirmFallback}
                >
                  اسحب الباقي من باقي الوسائل (محفظة/انستا/فيزا)
                </Button>
              )}
            </div>
          )}
          <SubmitButton size="lg" className="w-full">
            تأكيد صرف السلفة
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** سداد سلفة من سواق */
export function RepayAdvanceForm({
  driverId,
  outstanding,
}: {
  driverId: string;
  outstanding: number;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await repayDriverAdvance(driverId, fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound("money");
      setOpen(false);
      router.refresh();
    } catch {
      playSound("error");
      setErr("حصل خطأ غير متوقع، حاول تاني");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="success" size="lg" className="w-full" disabled={outstanding <= 0}>
          <HandCoins className="h-5 w-5" /> سداد سلفة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سداد سلفة من السواق</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          السلف المتبقية:{" "}
          <span className="font-bold text-warning">{formatMoney(outstanding)}</span>
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
              max={toEgp(outstanding)}
              inputMode="decimal"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة السداد</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" variant="success" className="w-full">
            تأكيد السداد
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
