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
import { distributeProfits } from "./actions";
import { formatMoney } from "@/lib/money";
import { PieChart } from "lucide-react";

export function DistributeForm({ netProfit }: { netProfit: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      await distributeProfits(fd);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full">
          <PieChart className="h-5 w-5" /> تصفية الخزنة وتوزيع الأرباح
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تصفية الخزنة</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          صافي الربح الحالي:{" "}
          <span className="font-bold text-primary">{formatMoney(netProfit)}</span>
        </p>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">المبلغ الموزّع (ج.م) *</Label>
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
            <p className="text-xs text-muted-foreground">
              يُقسَّم تلقائيًا على الشركاء حسب نسبهم.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الصرف</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            توزيع
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
