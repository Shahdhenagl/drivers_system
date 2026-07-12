"use client";

import { useState } from "react";
import Link from "next/link";
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
import { playSound } from "@/lib/sounds";
import { toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import type { StatementRowAction } from "@/components/party-print-statement";
import {
  deleteTrip,
  updateTripCollection,
  deleteTripCollection,
  updateTripDriverPayment,
  deleteTripDriverPayment,
  deleteCollectorHolding,
} from "@/app/(app)/trips/actions";
import { editAdvance, deleteAdvance } from "@/lib/advance-actions";
import {
  editPartyAdjustment,
  deletePartyAdjustment,
} from "@/lib/extra-profit-actions";
import { deleteExternalAdvance } from "@/lib/external-advance-actions";
import { Pencil, Trash2, Lock } from "lucide-react";

type Result = { error?: string } | void;

/** أزرار تعديل/حذف على صف كشف الحساب — توجّه لأكشن مصدر الحركة. */
export function StatementRowActions({ action }: { action?: StatementRowAction }) {
  if (!action) return null;

  switch (action.kind) {
    case "trip":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <Link
            href={`/trips/${action.id}`}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="فتح الرحلة للتعديل"
            title="تعديل الرحلة"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <DeleteButton
            confirmText="حذف الرحلة وكل تحصيلاتها ومستحقاتها؟ سيتم عكس تأثيرها من الخزنة والأرباح."
            run={() => deleteTrip(action.id)}
          />
        </div>
      );

    case "collection":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <MovementEditDialog
            title="تعديل تحصيل"
            amount={action.amount}
            method={action.method}
            note={action.note}
            date={action.date}
            withCollectors
            run={(fd) => updateTripCollection(action.id, fd)}
          />
          <DeleteButton run={() => deleteTripCollection(action.id)} />
        </div>
      );

    case "driverPayment":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <MovementEditDialog
            title="تعديل سداد"
            amount={action.amount}
            method={action.method}
            note={action.note}
            date={action.date}
            withCollectors
            run={(fd) => updateTripDriverPayment(action.id, fd)}
          />
          <DeleteButton run={() => deleteTripDriverPayment(action.id)} />
        </div>
      );

    case "advance":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <AdvanceEditDialog action={action} />
          <DeleteButton run={() => deleteAdvance(action.id)} />
        </div>
      );

    case "adjustment":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <AdjustmentEditDialog action={action} />
          <DeleteButton run={() => deletePartyAdjustment(action.id)} />
        </div>
      );

    case "external":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <DeleteButton
            confirmText="حذف السلفة الخارجية نهائيًا؟"
            run={() => deleteExternalAdvance(action.id)}
          />
        </div>
      );

    case "collectorHolding":
      return (
        <div className="flex items-center gap-1 print:hidden">
          <DeleteButton
            confirmText="حذف حركة المحصّل ده؟ سيتم حذف التحصيل المرتبط بها على المقاول أيضًا (عكس العملية بالكامل)."
            run={() => deleteCollectorHolding(action.id)}
          />
        </div>
      );

    case "locked":
      return (
        <span
          className="inline-flex p-1.5 text-muted-foreground/60 print:hidden"
          title={action.reason}
          aria-label={action.reason}
        >
          <Lock className="h-4 w-4" />
        </span>
      );
  }
}

function DeleteButton({
  run,
  confirmText = "حذف هذه الحركة؟ سيتم عكس تأثيرها من الحساب والخزنة.",
}: {
  run: () => Promise<Result>;
  confirmText?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(confirmText)) return;
    setLoading(true);
    try {
      const res = await run();
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("success");
      router.refresh();
    } catch (e) {
      // حذف الرحلة يعيد التوجيه لقائمة الرحلات — نتجاهل استثناء التوجيه
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("NEXT_REDIRECT")) {
        playSound("success");
        return;
      }
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
      title="حذف"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function EditTrigger() {
  return (
    <button
      type="button"
      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="تعديل"
      title="تعديل"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}

/** تعديل تحصيل/سداد: قيمة + وسيلة + تاريخ + ملاحظة */
function MovementEditDialog({
  title,
  amount,
  method,
  note,
  date,
  withCollectors,
  run,
}: {
  title: string;
  amount: number;
  method: string;
  note: string | null;
  date: Date;
  withCollectors?: boolean;
  run: (fd: FormData) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await run(fd);
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
        <EditTrigger />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mv-amount">القيمة (ج.م) *</Label>
            <Input
              id="mv-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={toEgp(amount)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>الطريقة</Label>
            <MethodSelect defaultValue={method} withCollectors={withCollectors} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-date">التاريخ</Label>
            <Input
              id="mv-date"
              name="date"
              type="date"
              defaultValue={toDateInput(new Date(date))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-note">ملاحظة</Label>
            <Textarea id="mv-note" name="note" defaultValue={note ?? ""} />
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

/** تعديل سلفة/رصيد: اتجاه + قيمة + وسيلة + تاريخ + ملاحظة */
function AdvanceEditDialog({
  action: a,
}: {
  action: Extract<StatementRowAction, { kind: "advance" }>;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [dir, setDir] = useState<"OUT" | "IN">(a.direction === "IN" ? "IN" : "OUT");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    fd.set("direction", dir);
    try {
      const res = await editAdvance(a.id, fd);
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
        <EditTrigger />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a.isOpening ? "تعديل رصيد افتتاحي" : "تعديل سلفة"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDir("OUT")}
              className={`rounded-xl border p-3 text-sm font-semibold ${
                dir === "OUT"
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-border text-muted-foreground"
              }`}
            >
              عليه (أخد مننا)
            </button>
            <button
              type="button"
              onClick={() => setDir("IN")}
              className={`rounded-xl border p-3 text-sm font-semibold ${
                dir === "IN"
                  ? "border-success bg-success/10 text-success"
                  : "border-border text-muted-foreground"
              }`}
            >
              له (احنا مدينين له)
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">القيمة (ج.م) *</Label>
            <Input
              id="adv-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={toEgp(a.amount)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>الوسيلة</Label>
            <MethodSelect defaultValue={a.method} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-date">التاريخ</Label>
            <Input
              id="adv-date"
              name="date"
              type="date"
              defaultValue={toDateInput(new Date(a.date))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-note">ملاحظة</Label>
            <Textarea id="adv-note" name="note" defaultValue={a.note ?? ""} />
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

/** تعديل ربح إضافي/إكرامية: قيمة + ملاحظة */
function AdjustmentEditDialog({
  action: a,
}: {
  action: Extract<StatementRowAction, { kind: "adjustment" }>;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await editPartyAdjustment(a.id, fd);
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
        <EditTrigger />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل {a.isProfit ? "ربح إضافي" : "إكرامية"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">القيمة (ج.م) *</Label>
            <Input
              id="adj-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={toEgp(a.amount)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-note">ملاحظة</Label>
            <Textarea id="adj-note" name="note" defaultValue={a.note ?? ""} />
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
