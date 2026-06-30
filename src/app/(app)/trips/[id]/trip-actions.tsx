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
  collectViaDriver,
  cancelTrip,
} from "../actions";
import { toPiastres } from "@/lib/money";
import { formatMoney, toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import {
  Play,
  CheckCircle2,
  XCircle,
  CheckCheck,
  Banknote,
  HandCoins,
  StickyNote,
  ArrowLeftRight,
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
      const res = await setTripStatus(tripId, s);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound(s === "CONFIRMED" ? "order" : "success");
      router.refresh();
    } catch {
      playSound("error");
      setErr("حصل خطأ غير متوقع، حاول تاني");
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
        {status !== "CANCELLED" && <CancelDialog tripId={tripId} />}
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
      <ViaDriverDialog
        tripId={tripId}
        hasDriver={props.hasDriver}
        remainingCollection={props.remainingCollection}
        remainingDriver={props.remainingDriver}
      />
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
      const res = await addCollection(tripId, fd);
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
      const res = await addDriverPayment(tripId, fd);
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

function CancelDialog({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [withPenalty, setWithPenalty] = useState(false);
  const [contractorP, setContractorP] = useState("");
  const [driverP, setDriverP] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  const officeRevenue =
    toPiastres(contractorP || "0") - toPiastres(driverP || "0");

  async function action(fd: FormData) {
    setErr("");
    fd.set("penaltyType", withPenalty ? "PENALTY" : "NONE");
    try {
      const res = await cancelTrip(tripId, fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound("cancel");
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
        <Button variant="destructive">
          <XCircle className="h-4 w-4" /> إلغاء
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء الطلب</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {/* سماح أو غرامة */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWithPenalty(false)}
              className={`rounded-xl border p-3 text-sm font-semibold ${
                !withPenalty
                  ? "border-success bg-success/10 text-success"
                  : "border-border text-muted-foreground"
              }`}
            >
              سماح (بدون غرامة)
            </button>
            <button
              type="button"
              onClick={() => setWithPenalty(true)}
              className={`rounded-xl border p-3 text-sm font-semibold ${
                withPenalty
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground"
              }`}
            >
              غرامة
            </button>
          </div>

          {withPenalty && (
            <div className="space-y-3 rounded-xl border border-dashed border-destructive/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="contractorPenalty">غرامة على العميل (ج.م)</Label>
                <Input
                  id="contractorPenalty"
                  name="contractorPenalty"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={contractorP}
                  onChange={(e) => setContractorP(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="driverPenalty">نصيب السواق منها (ج.م)</Label>
                <Input
                  id="driverPenalty"
                  name="driverPenalty"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={driverP}
                  onChange={(e) => setDriverP(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
                <span>إيراد المكتب من الغرامة</span>
                <span
                  className={`font-bold tabular-nums ${
                    officeRevenue >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {formatMoney(officeRevenue)}
                </span>
              </div>
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" variant="destructive" className="w-full">
            تأكيد الإلغاء
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViaDriverDialog({
  tripId,
  hasDriver,
  remainingCollection,
  remainingDriver,
}: {
  tripId: string;
  hasDriver: boolean;
  remainingCollection: number;
  remainingDriver: number;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const max = Math.min(remainingCollection, remainingDriver);

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await collectViaDriver(tripId, fd);
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
        <Button
          variant="secondary"
          className="w-full"
          disabled={!hasDriver || max <= 0}
        >
          <ArrowLeftRight className="h-4 w-4" /> تحصيل عن طريق السواق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تحصيل عن طريق السواق</DialogTitle>
        </DialogHeader>
        <div className="mb-3 space-y-1 rounded-lg bg-muted p-2 text-center text-sm">
          <p>المبلغ الذي سلّمه المقاول للسواق مباشرة.</p>
          <p className="text-xs text-muted-foreground">
            يُخصم من مديونية المقاول ومن مستحق السواق — ولا يؤثر على الخزنة.
          </p>
          <p className="font-bold">
            الحد الأقصى: <span className="text-primary">{formatMoney(max)}</span>
          </p>
        </div>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">القيمة (ج.م) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              max={toEgp(max)}
              inputMode="decimal"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" placeholder="تفاصيل إضافية (اختياري)" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            تأكيد التحصيل عن طريق السواق
          </SubmitButton>
        </form>
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
    playSound("success");
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
