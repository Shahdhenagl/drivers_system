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
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { editPartyAdjustment, deletePartyAdjustment } from "@/lib/extra-profit-actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toEgp } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { EXTRA_PROFIT_METHOD } from "@/lib/constants";
import { Pencil, Trash2 } from "lucide-react";

type Adjustment = {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  date: Date;
};

export function PartyAdjustments({ items }: { items: Adjustment[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="divide-y divide-border">
      <div className="px-3 py-2 text-xs font-bold text-muted-foreground">
        أرباح إضافية / إكراميات ({items.length})
      </div>
      {items.map((a) => {
        const isProfit = a.method === EXTRA_PROFIT_METHOD;
        return (
          <div key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <div className={`font-medium ${isProfit ? "text-primary" : "text-warning"}`}>
                {isProfit ? "ربح إضافي" : "إكرامية"} {formatMoney(a.amount)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatShortDate(a.date)}
                {a.note ? ` • ${a.note}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1 print:hidden">
              <EditDialog adjustment={a} isProfit={isProfit} />
              <DeleteButton id={a.id} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function EditDialog({
  adjustment,
  isProfit,
}: {
  adjustment: Adjustment;
  isProfit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await editPartyAdjustment(adjustment.id, fd);
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
      setErr("تعذّر التعديل");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="تعديل"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل {isProfit ? "ربح إضافي" : "إكرامية"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`adj-amount-${adjustment.id}`}>القيمة (ج.م) *</Label>
            <Input
              id={`adj-amount-${adjustment.id}`}
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={toEgp(adjustment.amount)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`adj-note-${adjustment.id}`}>ملاحظة</Label>
            <Textarea
              id={`adj-note-${adjustment.id}`}
              name="note"
              defaultValue={adjustment.note ?? ""}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            حفظ التعديل
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function onDelete() {
    if (!confirm("حذف هذه الحركة؟")) return;
    setLoading(true);
    try {
      const res = await deletePartyAdjustment(id);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("success");
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذّر الحذف");
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      aria-label="حذف"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
