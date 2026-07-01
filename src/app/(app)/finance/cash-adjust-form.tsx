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
import { adjustTreasury } from "./actions";
import { playSound } from "@/lib/sounds";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export function CashAdjustForm({ kind }: { kind: "deposit" | "withdraw" }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const isDeposit = kind === "deposit";

  async function action(fd: FormData) {
    setErr("");
    fd.set("kind", kind);
    try {
      const res = await adjustTreasury(fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound(isDeposit ? "money" : "cancel");
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
        <Button
          variant={isDeposit ? "secondary" : "outline"}
          size="sm"
          className={isDeposit ? "" : "text-destructive"}
        >
          {isDeposit ? (
            <ArrowDownLeft className="h-4 w-4" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
          {isDeposit ? "إيداع" : "سحب"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDeposit ? "إيداع نقدي" : "سحب نقدي"}</DialogTitle>
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
            <Label>الوسيلة</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" placeholder="سبب الإيداع/السحب (اختياري)" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            {isDeposit ? "تأكيد الإيداع" : "تأكيد السحب"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
