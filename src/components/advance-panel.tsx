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
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { MethodSelect } from "@/components/method-select";
import { addAdvance, deleteAdvance, editAdvance } from "@/lib/advance-actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toPiastres, toEgp } from "@/lib/money";
import { formatShortDate, toDateInput } from "@/lib/format";
import { methodLabel } from "@/lib/constants";
import { advanceReminder } from "@/lib/messages";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { Wallet, HandCoins, MessageCircle, FileClock, Pencil, Trash2 } from "lucide-react";

type AdvanceRow = {
  id: string;
  amount: number;
  direction: string;
  method: string;
  note: string | null;
  isOpening: boolean;
  date: Date;
};

type Mode = "give" | "receive" | "opening";

function AdvanceDialog({
  partyType,
  partyId,
  mode,
  trigger,
}: {
  partyType: "DRIVER" | "CONTRACTOR";
  partyId: string;
  mode: Mode;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [fallbackFd, setFallbackFd] = useState<FormData | null>(null);
  // للرصيد الافتتاحي: OUT = عليه (الكاش ينقص) | IN = له (الكاش يزيد)
  const [dir, setDir] = useState<"OUT" | "IN">("OUT");
  const [amountEgp, setAmountEgp] = useState("");
  const router = useRouter();

  const direction = mode === "give" ? "OUT" : mode === "receive" ? "IN" : dir;
  const isOpening = mode === "opening";
  const title =
    mode === "give" ? "صرف سلفة" : mode === "receive" ? "استلام / سداد" : "رصيد افتتاحي / سلفة سابقة";

  const amountP = toPiastres(amountEgp || "0");
  const cashEffect = direction === "OUT" ? -amountP : amountP;

  async function run(fd: FormData) {
    fd.set("partyType", partyType);
    fd.set("partyId", partyId);
    fd.set("direction", direction);
    fd.set("isOpening", isOpening ? "1" : "0");
    try {
      const res = await addAdvance(fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        setFallbackFd("canFallback" in res && res.canFallback ? fd : null);
        return;
      }
      playSound("money");
      setOpen(false);
      setAmountEgp("");
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          {mode === "opening" && (
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
          )}
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
              value={amountEgp}
              onChange={(e) => setAmountEgp(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>الوسيلة</Label>
            <MethodSelect />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">ملاحظة</Label>
            <Textarea id="note" name="note" placeholder="تفاصيل (اختياري)" />
          </div>
          {amountP > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
              <span>التأثير على الخزنة</span>
              <span
                className={`font-bold tabular-nums ${
                  cashEffect >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {cashEffect >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(cashEffect), false)}
              </span>
            </div>
          )}
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
            تأكيد
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** تعديل حركة سلفة/رصيد قائمة عبر زر قلم — ينعكس في الميزانية */
function EditAdvanceDialog({ advance }: { advance: AdvanceRow }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [dir, setDir] = useState<"OUT" | "IN">(
    advance.direction === "IN" ? "IN" : "OUT"
  );
  const [amountEgp, setAmountEgp] = useState(String(toEgp(advance.amount)));
  const router = useRouter();

  const amountP = toPiastres(amountEgp || "0");
  const cashEffect = dir === "OUT" ? -amountP : amountP;
  const title = advance.isOpening ? "تعديل رصيد افتتاحي" : "تعديل سلفة";

  async function action(fd: FormData) {
    setErr("");
    fd.set("direction", dir);
    try {
      const res = await editAdvance(advance.id, fd);
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
          <DialogTitle>{title}</DialogTitle>
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
            <Label htmlFor={`edit-amount-${advance.id}`}>القيمة (ج.م) *</Label>
            <Input
              id={`edit-amount-${advance.id}`}
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              autoFocus
              value={amountEgp}
              onChange={(e) => setAmountEgp(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>الوسيلة</Label>
            <MethodSelect defaultValue={advance.method} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-date-${advance.id}`}>التاريخ</Label>
            <Input
              id={`edit-date-${advance.id}`}
              name="date"
              type="date"
              defaultValue={toDateInput(new Date(advance.date))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-note-${advance.id}`}>ملاحظة</Label>
            <Textarea
              id={`edit-note-${advance.id}`}
              name="note"
              placeholder="تفاصيل (اختياري)"
              defaultValue={advance.note ?? ""}
            />
          </div>
          {amountP > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
              <span>التأثير على الخزنة</span>
              <span
                className={`font-bold tabular-nums ${
                  cashEffect >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {cashEffect >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(cashEffect), false)}
              </span>
            </div>
          )}
          {err && (
            <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
              {err}
            </p>
          )}
          <SubmitButton size="lg" className="w-full">
            حفظ التعديل
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** لوحة السلف/الأرصدة لطرف (سواق أو مقاول) */
function DeleteAdvanceButton({ advance }: { advance: AdvanceRow }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm("حذف هذه المعاملة؟ سيتم حذف تأثيرها من الحسابات والخزنة.")) return;
    setLoading(true);
    try {
      const res = await deleteAdvance(advance.id);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("success");
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذّر حذف المعاملة");
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
      aria-label="حذف المعاملة"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function AdvancePanel({
  partyType,
  partyId,
  name,
  phone,
  balance,
  advances,
}: {
  partyType: "DRIVER" | "CONTRACTOR";
  partyId: string;
  name: string;
  phone: string;
  balance: number; // + = عليه لنا، − = لنا عليه
  advances: AdvanceRow[];
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Wallet className="h-4 w-4" /> السلف والأرصدة
        </div>
        <span
          className={`text-lg font-extrabold tabular-nums ${
            balance > 0 ? "text-warning" : balance < 0 ? "text-success" : "text-muted-foreground"
          }`}
        >
          {balance > 0
            ? `عليه ${formatMoney(balance)}`
            : balance < 0
              ? `له ${formatMoney(-balance)}`
              : formatMoney(0)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 print:hidden">
        <AdvanceDialog
          partyType={partyType}
          partyId={partyId}
          mode="give"
          trigger={
            <Button variant="outline" size="lg" className="w-full">
              <Wallet className="h-5 w-5" /> صرف سلفة
            </Button>
          }
        />
        <AdvanceDialog
          partyType={partyType}
          partyId={partyId}
          mode="receive"
          trigger={
            <Button variant="success" size="lg" className="w-full">
              <HandCoins className="h-5 w-5" /> استلام / سداد
            </Button>
          }
        />
      </div>
      <AdvanceDialog
        partyType={partyType}
        partyId={partyId}
        mode="opening"
        trigger={
          <Button variant="secondary" size="sm" className="w-full print:hidden">
            <FileClock className="h-4 w-4" /> رصيد افتتاحي / سلفة سابقة
          </Button>
        }
      />

      {balance > 0 && (
        <WhatsAppButton
          phone={phone}
          message={advanceReminder(name, balance)}
          variant="outline"
          size="sm"
          className="w-full print:hidden"
        >
          <MessageCircle className="h-4 w-4" /> تذكير بسداد ما عليه
        </WhatsAppButton>
      )}

      {advances.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {advances.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-2.5 text-sm">
              <div>
                <div
                  className={`font-medium ${
                    a.direction === "OUT" ? "text-warning" : "text-success"
                  }`}
                >
                  {a.isOpening ? "رصيد افتتاحي" : a.direction === "OUT" ? "صرف" : "استلام"} —{" "}
                  {formatMoney(a.amount)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatShortDate(a.date)} • {methodLabel(a.method)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {a.note && (
                  <div className="max-w-[40%] truncate text-xs text-muted-foreground">
                    {a.note}
                  </div>
                )}
                <div className="flex items-center print:hidden">
                  <EditAdvanceDialog advance={a} />
                  <DeleteAdvanceButton advance={a} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
