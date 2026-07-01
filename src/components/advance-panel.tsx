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
import { addAdvance } from "@/lib/advance-actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toPiastres } from "@/lib/money";
import { formatShortDate, toDateInput } from "@/lib/format";
import { methodLabel } from "@/lib/constants";
import { advanceReminder } from "@/lib/messages";
import { whatsAppLink } from "@/lib/phone";
import { Wallet, HandCoins, MessageCircle, FileClock } from "lucide-react";

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

/** لوحة السلف/الأرصدة لطرف (سواق أو مقاول) */
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
        <Button asChild variant="outline" size="sm" className="w-full print:hidden">
          <a href={whatsAppLink(phone, advanceReminder(name, balance))} target="_blank">
            <MessageCircle className="h-4 w-4" /> تذكير بسداد ما عليه
          </a>
        </Button>
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
              {a.note && (
                <div className="max-w-[45%] truncate text-xs text-muted-foreground">
                  {a.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
