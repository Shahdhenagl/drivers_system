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
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { transferBetweenMethods } from "./actions";
import { playSound } from "@/lib/sounds";
import { ArrowLeftRight } from "lucide-react";

export function TransferForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await transferBetweenMethods(fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound("success");
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
        <Button variant="secondary" size="sm">
          <ArrowLeftRight className="h-4 w-4" /> تحويل بين الوسائل
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تحويل بين وسائل الدفع</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
          نقل رصيد بين وسائلك (لا يؤثر على الربح ولا على إجمالي الخزنة).
        </p>
        <form action={action} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>من</Label>
              <MethodSelect name="from" defaultValue="cash" />
            </div>
            <div className="space-y-1.5">
              <Label>إلى</Label>
              <MethodSelect name="to" defaultValue="wallet" />
            </div>
          </div>
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
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            تأكيد التحويل
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
