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
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteTripAdvance,
  deleteTripCollection,
  deleteTripDriverPayment,
  deleteTripTransfer,
  updateTripAdvance,
  updateTripCollection,
  updateTripDriverPayment,
  updateTripTransfer,
} from "../actions";

export type MovementActionData = {
  id: string;
  kind: "collection" | "driverPayment" | "transfer" | "advance";
  label: string;
  amount: number;
  method?: string | null;
  note?: string | null;
  date: Date;
};

export function MovementActions({ movement }: { movement: MovementActionData }) {
  return (
    <div className="flex items-center gap-1 print:hidden">
      <EditMovementDialog movement={movement} />
      <DeleteMovementButton movement={movement} />
    </div>
  );
}

function EditMovementDialog({ movement }: { movement: MovementActionData }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const hasMethod = movement.kind !== "transfer";

  async function action(fd: FormData) {
    setErr("");
    try {
      const res =
        movement.kind === "collection"
          ? await updateTripCollection(movement.id, fd)
          : movement.kind === "driverPayment"
            ? await updateTripDriverPayment(movement.id, fd)
            : movement.kind === "transfer"
              ? await updateTripTransfer(movement.id, fd)
              : await updateTripAdvance(movement.id, fd);
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
          <DialogTitle>تعديل الحركة المالية</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <p className="rounded-lg bg-muted p-2 text-center text-sm">
            {movement.label} — {formatMoney(movement.amount)}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`amount-${movement.kind}-${movement.id}`}>القيمة (ج.م) *</Label>
            <Input
              id={`amount-${movement.kind}-${movement.id}`}
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={toEgp(movement.amount)}
              required
              autoFocus
            />
          </div>
          {hasMethod && (
            <div className="space-y-1.5">
              <Label>الطريقة</Label>
              <MethodSelect defaultValue={movement.method ?? "cash"} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`date-${movement.kind}-${movement.id}`}>التاريخ</Label>
            <Input
              id={`date-${movement.kind}-${movement.id}`}
              name="date"
              type="date"
              defaultValue={toDateInput(movement.date)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${movement.kind}-${movement.id}`}>ملاحظة</Label>
            <Textarea
              id={`note-${movement.kind}-${movement.id}`}
              name="note"
              defaultValue={movement.note ?? ""}
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

function DeleteMovementButton({ movement }: { movement: MovementActionData }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm("حذف هذه الحركة؟ سيتم حذف تأثيرها من سجل الحسابات والخزنة.")) return;
    setLoading(true);
    try {
      const res =
        movement.kind === "collection"
          ? await deleteTripCollection(movement.id)
          : movement.kind === "driverPayment"
            ? await deleteTripDriverPayment(movement.id)
            : movement.kind === "transfer"
              ? await deleteTripTransfer(movement.id)
              : await deleteTripAdvance(movement.id);
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
