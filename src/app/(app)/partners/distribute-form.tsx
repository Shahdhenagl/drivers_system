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
import { distributeProfits } from "./actions";
import { playSound } from "@/lib/sounds";
import { formatMoney, toEgp } from "@/lib/money";
import {
  driverAccountMethodValue,
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
} from "@/lib/constants";
import { PieChart } from "lucide-react";

type PartnerOption = { id: string; name: string };
type DriverOption = { id: string; name: string };

export function DistributeForm({
  distributableProfit,
  partners,
  drivers,
}: {
  distributableProfit: number;
  partners: PartnerOption[];
  drivers: DriverOption[];
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const available = Math.max(distributableProfit, 0);

  async function action(fd: FormData) {
    setErr("");
    try {
      const res = await distributeProfits(fd);
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
        <Button size="lg" className="w-full">
          <PieChart className="h-5 w-5" /> تصفية الخزنة وتوزيع الأرباح
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تصفية الخزنة</DialogTitle>
        </DialogHeader>
        <p className="mb-3 rounded-lg bg-muted p-2 text-center text-sm">
          الربح المتاح للتوزيع:{" "}
          <span className="font-bold text-primary">{formatMoney(available)}</span>
        </p>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">المبلغ الموزع (ج.م) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              max={toEgp(available)}
              defaultValue={toEgp(available)}
              inputMode="decimal"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>استلام كل شريك</Label>
            {partners.map((partner) => (
              <div key={partner.id} className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {partner.name}
                </span>
                <select
                  name={`method_${partner.id}`}
                  defaultValue="cash"
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {PAYMENT_METHOD_KEYS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHODS[m]}
                    </option>
                  ))}
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driverAccountMethodValue(driver.id)}>
                      حساب السواق - {driver.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
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
