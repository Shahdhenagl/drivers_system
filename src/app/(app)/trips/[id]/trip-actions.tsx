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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import {
  setTripStatus,
  addCollection,
  addDriverPayment,
  addNote,
} from "../actions";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import {
  Play,
  CheckCircle2,
  XCircle,
  CheckCheck,
  Banknote,
  HandCoins,
  StickyNote,
} from "lucide-react";

type Props = {
  tripId: string;
  status: string;
  hasDriver: boolean;
  remainingCollection: number;
  remainingDriver: number;
  notes: string | null;
};

export function TripActions(props: Props) {
  const router = useRouter();
  const { tripId, status } = props;
  const [err, setErr] = useState("");

  async function changeStatus(s: string) {
    setErr("");
    try {
      await setTripStatus(tripId, s);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <div className="space-y-3">
      {err && (
        <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">
          {err}
        </p>
      )}

      {/* أزرار الحالة */}
      <div className="grid grid-cols-2 gap-2">
        {status !== "IN_PROGRESS" && status !== "COMPLETED" && status !== "CANCELLED" && (
          <Button variant="secondary" onClick={() => changeStatus("CONFIRMED")}>
            <CheckCircle2 className="h-4 w-4" /> تأكيد
          </Button>
        )}
        {status !== "COMPLETED" && status !== "CANCELLED" && (
          <Button variant="warning" onClick={() => changeStatus("IN_PROGRESS")}>
            <Play className="h-4 w-4" /> بدء التنفيذ
          </Button>
        )}
        {status !== "COMPLETED" && status !== "CANCELLED" && (
          <Button variant="success" onClick={() => changeStatus("COMPLETED")}>
            <CheckCheck className="h-4 w-4" /> إنهاء الرحلة
          </Button>
        )}
        {status !== "CANCELLED" && (
          <Button variant="destructive" onClick={() => changeStatus("CANCELLED")}>
            <XCircle className="h-4 w-4" /> إلغاء
          </Button>
        )}
      </div>

      {/* المال + الملاحظة */}
      <div className="grid grid-cols-2 gap-2">
        <CollectDialog tripId={tripId} remaining={props.remainingCollection} />
        <DriverPayDialog
          tripId={tripId}
          remaining={props.remainingDriver}
          hasDriver={props.hasDriver}
        />
      </div>
      <NoteDialog tripId={tripId} notes={props.notes} />
    </div>
  );
}

function CollectDialog({
  tripId,
  remaining,
}: {
  tripId: string;
  remaining: number;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      await addCollection(tripId, fd);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={remaining <= 0}>
          <Banknote className="h-4 w-4" /> تحصيل
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تحصيل من المقاول</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          المتبقي: <span className="font-bold text-destructive">{formatMoney(remaining)}</span>
        </p>
        <PaymentFields action={action} max={toEgp(remaining)} err={err} submit="تأكيد التحصيل" />
      </DialogContent>
    </Dialog>
  );
}

function DriverPayDialog({
  tripId,
  remaining,
  hasDriver,
}: {
  tripId: string;
  remaining: number;
  hasDriver: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      await addDriverPayment(tripId, fd);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="warning" disabled={!hasDriver || remaining <= 0}>
          <HandCoins className="h-4 w-4" /> سداد السواق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سداد مستحق السواق</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          المتبقي: <span className="font-bold text-warning">{formatMoney(remaining)}</span>
        </p>
        <PaymentFields action={action} max={toEgp(remaining)} err={err} submit="تأكيد السداد" />
      </DialogContent>
    </Dialog>
  );
}

function PaymentFields({
  action,
  max,
  err,
  submit,
}: {
  action: (fd: FormData) => Promise<void>;
  max: number;
  err: string;
  submit: string;
}) {
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="amount">القيمة (ج.م) *</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          max={max}
          inputMode="decimal"
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>طريقة الدفع</Label>
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
      <SubmitButton size="lg" className="w-full">
        {submit}
      </SubmitButton>
    </form>
  );
}

function NoteDialog({
  tripId,
  notes,
}: {
  tripId: string;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function action(fd: FormData) {
    await addNote(tripId, fd);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <StickyNote className="h-4 w-4" /> {notes ? "تعديل الملاحظة" : "إضافة ملاحظة"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ملاحظة على الرحلة</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <Textarea name="note" defaultValue={notes ?? ""} rows={4} autoFocus />
          <SubmitButton size="lg" className="w-full">
            حفظ
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
