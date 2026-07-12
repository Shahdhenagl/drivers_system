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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { formatMoney, toEgp } from "@/lib/money";
import { playSound } from "@/lib/sounds";
import { Pencil, Trash2 } from "lucide-react";
import { deleteLedgerMovement, updateLedgerMovement } from "./actions";

export type LedgerActionData = {
  id: string;
  type: string;
  direction: string;
  amount: number;
  method: string;
  description: string;
  refType?: string | null;
  refId?: string | null;
  date: Date;
  expense?: {
    name: string;
    category?: string | null;
    notes?: string | null;
  } | null;
};

export function LedgerActions({ movement }: { movement: LedgerActionData }) {
  if (movement.type === "CAPITAL") return null;

  return (
    <div className="flex items-center gap-1 print:hidden">
      <EditLedgerDialog movement={movement} />
      <DeleteLedgerButton movement={movement} />
    </div>
  );
}

function EditLedgerDialog({ movement }: { movement: LedgerActionData }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const isExpense = movement.refType === "Expense";

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await updateLedgerMovement(movement.id, fd);
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
      setErr("تعذر تعديل الحركة");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="تعديل الحركة"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل حركة دفتر الأستاذ</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <p className="rounded-lg bg-muted p-2 text-center text-sm">
            {movement.description} - {formatMoney(movement.amount)}
          </p>
          {isExpense && (
            <div className="space-y-1.5">
              <Label htmlFor={`name-${movement.id}`}>اسم المصروف *</Label>
              <Input
                id={`name-${movement.id}`}
                name="name"
                defaultValue={movement.expense?.name ?? movement.description.replace(/^مصروف\s*[-—]\s*/, "")}
                required
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`amount-${movement.id}`}>القيمة (ج.م) *</Label>
              <Input
                id={`amount-${movement.id}`}
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={toEgp(movement.amount)}
                required
                autoFocus={!isExpense}
              />
            </div>
            {isExpense && (
              <div className="space-y-1.5">
                <Label>الفئة</Label>
                <Select name="category" defaultValue={movement.expense?.category ?? "عام"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>الوسيلة</Label>
            <MethodSelect
              defaultValue={movement.method}
              withCollectors={
                movement.refType === "Collection" ||
                movement.refType === "DriverPayment" ||
                movement.refType === "Expense"
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`date-${movement.id}`}>التاريخ</Label>
            <Input
              id={`date-${movement.id}`}
              name="date"
              type="date"
              defaultValue={toDateInput(movement.date)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${movement.id}`}>
              {isExpense ? "ملاحظات" : "وصف / ملاحظة"}
            </Label>
            <Textarea
              id={`note-${movement.id}`}
              name={isExpense ? "notes" : "note"}
              defaultValue={isExpense ? movement.expense?.notes ?? "" : movement.description}
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

function DeleteLedgerButton({ movement }: { movement: LedgerActionData }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm("حذف هذه الحركة؟ سيتم حذف تأثيرها من الخزنة والحسابات المرتبطة.")) return;
    setLoading(true);
    try {
      const res = await deleteLedgerMovement(movement.id);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("success");
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذر حذف الحركة");
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
      aria-label="حذف الحركة"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
