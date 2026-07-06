"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { formatShortDate, toDateInput } from "@/lib/format";
import { formatMoney, toEgp } from "@/lib/money";
import {
  addExternalAdvance,
  deleteExternalAdvance,
  editExternalAdvance,
  reopenExternalAdvance,
  settleExternalAdvance,
} from "@/lib/external-advance-actions";
import { playSound } from "@/lib/sounds";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

type PartyType = "DRIVER" | "CONTRACTOR";

type PartyOption = {
  type: PartyType;
  id: string;
  name: string;
  label: string;
};

type ExternalAdvanceRow = {
  id: string;
  borrowerType: string;
  borrowerId: string;
  borrowerName: string;
  lenderType: string;
  lenderId: string;
  lenderName: string;
  amount: number;
  collectedAmount?: number; // المحصَّل من المستلِف (borrower)
  paidAmount?: number; // المسلَّم للمُقرِض (lender)
  date: Date;
  note: string | null;
  status: string;
  settledAt: Date | null;
};

function partyKey(type: string, id: string) {
  return `${type}:${id}`;
}

function parsePartyKey(value: string) {
  const [type, id] = value.split(":");
  return { type, id };
}

function partyTypeLabel(type: string) {
  return type === "DRIVER" ? "سواق" : "مقاول";
}

function PartySelect({
  name,
  label,
  options,
  defaultType,
  defaultId,
}: {
  name: "borrower" | "lender";
  label: string;
  options: PartyOption[];
  defaultType?: string;
  defaultId?: string;
}) {
  const defaultValue =
    defaultType && defaultId ? partyKey(defaultType, defaultId) : "";
  const [value, setValue] = useState(defaultValue);
  const parsed = parsePartyKey(value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-party`}>{label}</Label>
      <select
        id={`${name}-party`}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      >
        <option value="">اختار طرف</option>
        {options.map((o) => (
          <option key={partyKey(o.type, o.id)} value={partyKey(o.type, o.id)}>
            {o.label}
          </option>
        ))}
      </select>
      <input type="hidden" name={`${name}Type`} value={parsed.type ?? ""} />
      <input type="hidden" name={`${name}Id`} value={parsed.id ?? ""} />
    </div>
  );
}

function ExternalAdvanceDialog({
  mode,
  trigger,
  currentParty,
  options,
  advance,
}: {
  mode: "add" | "edit";
  trigger: React.ReactNode;
  currentParty: { type: PartyType; id: string; name: string };
  options: PartyOption[];
  advance?: ExternalAdvanceRow;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function action(fd: FormData) {
    setErr("");
    try {
      const res =
        mode === "edit" && advance
          ? await editExternalAdvance(advance.id, fd)
          : await addExternalAdvance(fd);
      if (res?.error) {
        playSound("error");
        setErr(res.error);
        return;
      }
      playSound("success");
      setOpen(false);
      router.refresh();
    } catch {
      playSound("error");
      setErr("حصل خطأ غير متوقع، حاول تاني");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "تعديل سلفة خارجية" : "سلفة خارجية"}
          </DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <PartySelect
            name="borrower"
            label="اللي استلف"
            options={options}
            defaultType={advance?.borrowerType ?? currentParty.type}
            defaultId={advance?.borrowerId ?? currentParty.id}
          />
          <PartySelect
            name="lender"
            label="استلف من"
            options={options}
            defaultType={advance?.lenderType}
            defaultId={advance?.lenderId}
          />
          <div className="space-y-1.5">
            <Label htmlFor="external-amount">القيمة (ج.م) *</Label>
            <Input
              id="external-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              defaultValue={advance ? toEgp(advance.amount) : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="external-date">التاريخ</Label>
            <Input
              id="external-date"
              name="date"
              type="date"
              defaultValue={toDateInput(advance ? new Date(advance.date) : new Date())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="external-note">ملاحظة</Label>
            <Textarea
              id="external-note"
              name="note"
              defaultValue={advance?.note ?? ""}
            />
          </div>
          <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
            السلفة الخارجية بين الأطراف فقط ولا تؤثر على خزنة المكتب أو
            الماليات.
          </p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SubmitButton size="lg" className="w-full">
            {mode === "edit" ? "حفظ التعديل" : "تأكيد السلفة"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ row }: { row: ExternalAdvanceRow }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run(kind: "settle" | "reopen" | "delete") {
    if (
      kind === "delete" &&
      !confirm("حذف السلفة الخارجية؟ لن يؤثر هذا على خزنة المكتب.")
    ) {
      return;
    }
    setLoading(true);
    try {
      const res =
        kind === "settle"
          ? await settleExternalAdvance(row.id)
          : kind === "reopen"
            ? await reopenExternalAdvance(row.id)
            : await deleteExternalAdvance(row.id);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound(kind === "delete" ? "success" : "money");
      router.refresh();
    } catch {
      playSound("error");
      alert("حصل خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {row.status === "OPEN" ? (
        <button
          type="button"
          disabled={loading}
          className="rounded-lg p-1.5 text-success hover:bg-success/10 disabled:opacity-50"
          onClick={() => run("settle")}
          aria-label="سداد"
          title="سداد"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          disabled={loading}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          onClick={() => run("reopen")}
          aria-label="إعادة فتح"
          title="إعادة فتح"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        disabled={loading}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        onClick={() => run("delete")}
        aria-label="حذف"
        title="حذف"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

export function ExternalAdvancePanel({
  currentParty,
  parties,
  advances,
}: {
  currentParty: { type: PartyType; id: string; name: string };
  parties: PartyOption[];
  advances: ExternalAdvanceRow[];
}) {
  const totals = useMemo(() => {
    return advances
      .filter((a) => a.status !== "SETTLED")
      .reduce(
        (acc, a) => {
          if (
            a.borrowerType === currentParty.type &&
            a.borrowerId === currentParty.id
          ) {
            acc.onHim += Math.max(a.amount - (a.collectedAmount ?? 0), 0);
          }
          if (
            a.lenderType === currentParty.type &&
            a.lenderId === currentParty.id
          ) {
            acc.forHim += Math.max(a.amount - (a.paidAmount ?? 0), 0);
          }
          return acc;
        },
        { forHim: 0, onHim: 0 }
      );
  }, [advances, currentParty.id, currentParty.type]);

  const openRows = advances.filter((a) => a.status !== "SETTLED");
  const settledRows = advances.filter((a) => a.status === "SETTLED");

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <History className="h-4 w-4" /> السلف الخارجية
        </div>
        <ExternalAdvanceDialog
          mode="add"
          currentParty={currentParty}
          options={parties}
          trigger={
            <Button variant="secondary" size="sm" className="print:hidden">
              <Plus className="h-4 w-4" /> سلفة خارجية
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-destructive/10 p-2">
          <div className="text-[11px] text-muted-foreground">له خارجيًا</div>
          <div className="font-bold text-destructive">{formatMoney(totals.forHim)}</div>
        </div>
        <div className="rounded-lg bg-success/10 p-2">
          <div className="text-[11px] text-muted-foreground">عليه خارجيًا</div>
          <div className="font-bold text-success">{formatMoney(totals.onHim)}</div>
        </div>
      </div>

      <div className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
        سلف بين السواقين والمقاولين. عند تحصيلها/سدادها عبر «تحصيل الكل» أو «سداد
        الكل» تدخل/تخرج من خزنة المكتب كأمانة (تؤثر على الكاش لا الربح) وتُعلَّم
        مسددة كليًا أو جزئيًا.
      </div>

      <ExternalRows
        title="مفتوحة"
        rows={openRows}
        currentParty={currentParty}
        parties={parties}
      />
      <ExternalRows
        title="مسددة"
        rows={settledRows}
        currentParty={currentParty}
        parties={parties}
      />
    </Card>
  );
}

function ExternalRows({
  title,
  rows,
  currentParty,
  parties,
}: {
  title: string;
  rows: ExternalAdvanceRow[];
  currentParty: { type: PartyType; id: string; name: string };
  parties: PartyOption[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className="bg-muted/60 px-2.5 py-1.5 text-xs font-bold text-muted-foreground">
        {title}
      </div>
      {rows.map((row) => {
        const isBorrower =
          row.borrowerType === currentParty.type &&
          row.borrowerId === currentParty.id;
        const otherName = isBorrower ? row.lenderName : row.borrowerName;
        const otherType = isBorrower ? row.lenderType : row.borrowerType;
        // الساق الخاصة بالطرف الحالي: المستلِف يُتابَع بالمحصَّل، المُقرِض بالمسلَّم
        const legDone = isBorrower ? row.collectedAmount ?? 0 : row.paidAmount ?? 0;
        const isSettled = row.status === "SETTLED";
        const remaining = Math.max(row.amount - legDone, 0);
        const isPartial = !isSettled && legDone > 0;
        return (
          <div key={row.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0">
              <div
                className={`flex items-center gap-1 font-medium ${
                  isBorrower ? "text-success" : "text-destructive"
                }`}
              >
                {isBorrower ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4" />
                )}
                {isBorrower ? "عليه" : "له"}{" "}
                {formatMoney(isSettled ? row.amount : remaining)}
              </div>
              <div className="text-xs text-muted-foreground">
                {isBorrower ? "استلف من" : "أعطى سلفة لـ"} {otherName} (
                {partyTypeLabel(otherType)}) • {formatShortDate(row.date)}
                {isPartial ? ` • مسدَّد جزئيًا من ${formatMoney(row.amount)}` : ""}
                {isSettled && row.settledAt
                  ? ` • اتسدد ${formatShortDate(row.settledAt)}`
                  : ""}
              </div>
              {row.note && (
                <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {row.note}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 print:hidden">
              <ExternalAdvanceDialog
                mode="edit"
                currentParty={currentParty}
                options={parties}
                advance={row}
                trigger={
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="تعديل"
                    title="تعديل"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                }
              />
              <RowActions row={row} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
