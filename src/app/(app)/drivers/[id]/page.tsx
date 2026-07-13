import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { PartyPrintStatement, type StatementRow } from "@/components/party-print-statement";
import { DriverForm } from "../driver-form";
import { DeleteDriverButton } from "../delete-driver-button";
import { PayDriverForm } from "../pay-driver-form";
import { AdvancePanel } from "@/components/advance-panel";
import { ExternalAdvancePanel } from "@/components/external-advance-panel";
import { AccountTotalSummary } from "@/components/account-total-summary";
import { DailyReviewToggle } from "@/components/daily-review-toggle";
import { MonthFilter } from "@/components/month-filter";
import { ExtraProfitForm } from "@/components/extra-profit-form";
import { TipForm } from "@/components/driver-tip-form";
import { PartyAdjustments } from "@/components/party-adjustments";
import { OffsetAccountButton } from "@/components/offset-account-button";
import { StartNewStatementButton } from "@/components/start-new-statement-button";
import { PartyStatement } from "@/components/party-statement";
import { setDriverReviewed } from "../actions";
import { formatMoney } from "@/lib/money";
import {
  startOfDay,
  endOfDay,
  addDays,
  cairoMonthStr,
  monthLabel,
  monthBounds,
  sameCairoDay,
} from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { effectiveAmounts } from "@/lib/finance";
import { advanceRowAction } from "@/lib/statement-actions";
import { driverReport } from "@/lib/messages";
import {
  COMPANY_NAME,
  driverIdFromAccountMethod,
  methodLabel,
  TRIP_STATUS,
  tripStatus,
  EXTRA_PROFIT_METHOD,
  TIP_METHOD,
  isSystemAdvanceMethod,
} from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ArrowRight,
  Truck,
  Plus,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriverProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m } = await searchParams;
  const d = await prisma.driver.findUnique({
    where: { id },
    include: {
      trips: {
        orderBy: { date: "desc" },
        include: {
          contractor: { select: { name: true } },
          driverPayments: true,
        },
      },
      payments: {
        orderBy: { date: "desc" },
        include: {
          trip: {
            select: {
              startPoint: true,
              endPoint: true,
              contractor: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!d) notFound();

  // ===== فلتر الشهر — الافتراضي الشهر الحالي (يُخفي الأقدم تلقائيًا)، و"all" لكل الشهور =====
  const now = new Date();
  const currentMonth = cairoMonthStr(now);
  const monthSet = new Set<string>([currentMonth]);
  for (const t of d.trips) monthSet.add(cairoMonthStr(t.date));
  for (const p of d.payments) monthSet.add(cairoMonthStr(p.date));
  const months = [...monthSet]
    .sort()
    .reverse()
    .map((v) => ({ value: v, label: monthLabel(v) }));
  const selectedMonth =
    m === "all"
      ? "all"
      : m && months.some((x) => x.value === m)
        ? m
        : currentMonth;
  const bounds = selectedMonth === "all" ? null : monthBounds(selectedMonth);
  const inMonth = (dt: Date) => !bounds || (dt >= bounds[0] && dt < bounds[1]);
  const trips = bounds ? d.trips.filter((t) => inMonth(t.date)) : d.trips;
  const monthPayments = bounds
    ? d.payments.filter((p) => inMonth(p.date))
    : d.payments;

  // علامة المراجعة اليومية (تتصفّر تلقائيًا كل يوم)
  const reviewedToday = d.lastReviewedAt
    ? sameCairoDay(d.lastReviewedAt, now)
    : false;

  // السلف/الأرصدة تُجلب منفصلة ومرنة (لو الجدول غير موجود بعد قبل الترحيل)
  const advances = await prisma.advance
    .findMany({
      where: { partyType: "DRIVER", partyId: id },
      orderBy: { date: "desc" },
    })
    .catch(
      () =>
        [] as {
          id: string;
          amount: number;
          direction: string;
          method: string;
          note: string | null;
          isOpening: boolean;
          date: Date;
        }[]
    );
  // فصل الأرباح الإضافية/الإكراميات عن سلف المكتب العادية
  const adjustments = advances.filter(
    (a) => a.method === EXTRA_PROFIT_METHOD || a.method === TIP_METHOD
  );
  const officeAdvances = advances.filter(
    (a) => a.method !== EXTRA_PROFIT_METHOD && a.method !== TIP_METHOD
  );
  const [allContractors, allDrivers, externalAdvances] = await Promise.all([
    prisma.contractor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.externalAdvance
      .findMany({
        where: {
          OR: [
            { borrowerType: "DRIVER", borrowerId: id },
            { lenderType: "DRIVER", lenderId: id },
          ],
        },
        orderBy: [{ status: "asc" }, { date: "desc" }],
      })
      .catch(() => []),
  ]);
  const externalParties = [
    ...allContractors.map((p) => ({
      type: "CONTRACTOR" as const,
      id: p.id,
      name: p.name,
      label: `مقاول - ${p.name}`,
    })),
    ...allDrivers.map((p) => ({
      type: "DRIVER" as const,
      id: p.id,
      name: p.name,
      label: `سواق - ${p.name}`,
    })),
  ];

  // إجماليات كل الشهور — تقود المتبقي القائم والسداد والرصيد (مستقلة عن الفلتر)
  const totalDue = d.trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const totalPaid = d.payments.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(totalDue - totalPaid, 0);

  // إجماليات الشهر المختار — لصناديق الملخص فقط
  const dueMonth = trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const paidMonth = monthPayments.reduce((a, p) => a + p.amount, 0);
  const remainingMonth = Math.max(dueMonth - paidMonth, 0);

  // رصيد السلف: OUT − IN (موجب = عليه لنا، سالب = لنا عليه)
  const advOut = advances
    .filter((a) => a.direction === "OUT")
    .reduce((s, a) => s + a.amount, 0);
  const advIn = advances
    .filter((a) => a.direction === "IN")
    .reduce((s, a) => s + a.amount, 0);
  const advanceBalance = advOut - advIn;
  // السلف الخارجية تُحسب بقيمتها الكاملة ما لم تُعلَّم "مسددة" (تبقى كسجل)
  const externalFor = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.lenderType === "DRIVER" && a.lenderId === id)
    .reduce((s, a) => s + a.amount, 0);
  const externalOn = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.borrowerType === "DRIVER" && a.borrowerId === id)
    .reduce((s, a) => s + a.amount, 0);
  const officeFor = Math.max(-advanceBalance, 0);
  const officeOn = Math.max(advanceBalance, 0);
  const totalForDriver = remaining + officeFor + externalFor;
  const totalOnDriver = officeOn + externalOn;

  // الحساب الشامل يحترم فلتر الشهر: عند اختيار شهر يعرض صافي حركة الشهر فقط
  const inBounds = (dt: Date) => !bounds || (dt >= bounds[0] && dt < bounds[1]);
  const mAdvBal =
    advances
      .filter((a) => a.direction === "OUT" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0) -
    advances
      .filter((a) => a.direction === "IN" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0);
  const mExternalFor = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.lenderType === "DRIVER" && a.lenderId === id && inBounds(a.date))
    .reduce((s, a) => s + a.amount, 0);
  const mExternalOn = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.borrowerType === "DRIVER" && a.borrowerId === id && inBounds(a.date))
    .reduce((s, a) => s + a.amount, 0);
  const sOfficeFor = bounds ? Math.max(-mAdvBal, 0) : officeFor;
  const sOfficeOn = bounds ? Math.max(mAdvBal, 0) : officeOn;
  const sExternalFor = bounds ? mExternalFor : externalFor;
  const sExternalOn = bounds ? mExternalOn : externalOn;
  const sRemaining = bounds ? remainingMonth : remaining;
  const summaryFor = sRemaining + sOfficeFor + sExternalFor;
  const summaryOn = sOfficeOn + sExternalOn;

  const periodLabel = bounds ? monthLabel(selectedMonth) : "كل الفترات";
  const statementRows: StatementRow[] = [
    ...trips.map((t) => ({
      id: `trip-${t.id}`,
      date: t.date,
      description: `رحلة ${t.startPoint} ← ${t.endPoint}`,
      details: `المقاول: ${t.contractor.name} • ${TRIP_STATUS[tripStatus(t.status)]}`,
      forParty: effectiveAmounts(t).driver,
      action: { kind: "trip" as const, id: t.id },
    })),
    ...monthPayments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.date,
      description: `سداد للسواق - ${methodLabel(p.method)}`,
      details: p.note
        ? p.note
        : p.trip
          ? `${p.trip.startPoint} ← ${p.trip.endPoint}`
          : null,
      received: p.amount,
      action: {
        kind: "driverPayment" as const,
        id: p.id,
        amount: p.amount,
        method: p.method,
        note: p.note ?? null,
        date: p.date,
      },
    })),
    ...advances
      .filter((a) => inBounds(a.date) && driverIdFromAccountMethod(a.method))
      .map((a) => ({
        id: `partner-settlement-${a.id}`,
        date: a.date,
        description: "ربح شريك على حساب السواق",
        details: a.note,
        forParty: a.amount,
        action: {
          kind: "locked" as const,
          reason: "ربح شريك على حساب السواق — يُدار من صفحة الشركاء",
        },
      })),
    ...advances
      .filter((a) => inBounds(a.date) && !driverIdFromAccountMethod(a.method))
      .map((a) => ({
        id: `advance-${a.id}`,
        date: a.date,
        description: isSystemAdvanceMethod(a.method)
          ? methodLabel(a.method)
          : a.direction === "OUT"
            ? `استلم من المكتب - ${methodLabel(a.method)}`
            : `دفع للمكتب - ${methodLabel(a.method)}`,
        details: a.note,
        onParty: a.direction === "OUT" ? a.amount : undefined,
        paid: a.direction === "IN" ? a.amount : undefined,
        received: a.direction === "OUT" ? a.amount : undefined,
        action: advanceRowAction(a),
      })),
    ...externalAdvances
      .filter((a) => inBounds(a.date))
      .map((a) => {
        const isBorrower = a.borrowerType === "DRIVER" && a.borrowerId === id;
        return {
          id: `external-${a.id}`,
          date: a.date,
          description: isBorrower
            ? `استلم سلفة خارجية من ${a.lenderName}`
            : `دفع سلفة خارجية إلى ${a.borrowerName}`,
          details: `${a.status === "SETTLED" ? "مسددة" : "مفتوحة"}${a.note ? ` • ${a.note}` : ""}`,
          forParty: isBorrower ? undefined : a.amount,
          onParty: isBorrower ? a.amount : undefined,
          paid: isBorrower ? undefined : a.amount,
          received: isBorrower ? a.amount : undefined,
          action: { kind: "external" as const, id: a.id },
        };
      }),
  ];
  const statementTotals = statementRows.reduce(
    (acc, row) => ({
      forParty: acc.forParty + (row.forParty ?? 0),
      onParty: acc.onParty + (row.onParty ?? 0),
      paid: acc.paid + (row.paid ?? 0),
      received: acc.received + (row.received ?? 0),
    }),
    { forParty: 0, onParty: 0, paid: 0, received: 0 }
  );
  const netDriver = summaryFor - summaryOn;
  // أرشفة كشف الحساب: نعرض الحركات الأحدث من تاريخ التصفير فقط (البيانات محفوظة)
  const clearedAt = (d as { statementClearedAt?: Date | null }).statementClearedAt ?? null;
  const visibleStatementRows = clearedAt
    ? statementRows.filter((r) => +r.date >= +clearedAt)
    : statementRows;

  // تقارير واتساب دورية
  const reportPeriods = [
    { label: "أسبوعي", from: startOfDay(addDays(now, -6)), to: endOfDay(now) },
    { label: "شهري", from: startOfDay(addDays(now, -29)), to: endOfDay(now) },
  ];
  const reports = reportPeriods.map((p) => {
    const inP = d.trips
      .filter((t) => t.date >= p.from && t.date <= p.to)
      .sort((a, b) => +a.date - +b.date);
    const total = inP.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
    const settled = inP.reduce(
      (a, t) => a + t.driverPayments.reduce((s, x) => s + x.amount, 0),
      0
    );
    const msg = driverReport({
      name: d.name,
      periodLabel: p.label,
      from: p.from,
      to: p.to,
      trips: inP.map((t) => ({
        date: t.date,
        startPoint: t.startPoint,
        endPoint: t.endPoint,
        vehicleType: t.vehicleType,
        driverDue: effectiveAmounts(t).driver,
        paid: t.driverPayments.reduce((s, x) => s + x.amount, 0),
      })),
      total,
      settled,
      remainingTotal: remaining,
      advanceBalance,
      externalFor,
      externalOn,
    });
    return { label: p.label, message: msg };
  });

  return (
    <>
      <AppHeader title="ملف السواق" />
      <PartyPrintStatement
        companyName={COMPANY_NAME}
        partyType="سواق"
        partyName={d.name}
        phone={displayPhone(d.phone)}
        periodLabel={periodLabel}
        generatedAt={now}
        summary={{
          totalForParty: summaryFor,
          totalOnParty: summaryOn,
          totalPaid: statementTotals.paid,
          totalReceived: statementTotals.received,
          netLabel:
            netDriver > 0
              ? "صافي ليه"
              : netDriver < 0
                ? "صافي عليه"
                : "الحساب متعادل",
          netAmount: Math.abs(netDriver),
        }}
        rows={visibleStatementRows}
        counterpartyLabel="المقاول"
        priceColumn="driver"
        trips={trips
          .filter((t) => !clearedAt || +t.date >= +clearedAt)
          .map((t) => ({
            id: t.id,
            date: t.date,
            startPoint: t.startPoint,
            endPoint: t.endPoint,
            vehicleType: t.vehicleType,
            counterparty: t.contractor.name,
            contractorPrice: effectiveAmounts(t).contractor,
            driverDue: effectiveAmounts(t).driver,
            statusLabel: TRIP_STATUS[tripStatus(t.status)],
          }))}
      />
      <div className="space-y-4 py-3 print:hidden">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للقائمة
        </Link>

        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-bold">{d.name}</div>
                <div className="text-sm text-muted-foreground">
                  {d.vehicleType}
                  {d.vehicleNumber ? ` • ${d.vehicleNumber}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {displayPhone(d.phone)}
                </div>
                {d.altPhone && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(d.altPhone)} (إضافي)
                  </div>
                )}
                {d.phone3 && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(d.phone3)} (إضافي)
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <DriverForm
                driver={d}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <DeleteDriverButton id={d.id} />
            </div>
          </div>
          {d.notes && <p className="rounded-lg bg-muted p-2 text-sm">{d.notes}</p>}
          <div className="flex gap-2 print:hidden">
            <WhatsAppButton
              phones={[d.phone, d.altPhone, d.phone3]}
              message={`مرحبًا ${d.name}`}
              variant="success"
              size="sm"
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </WhatsAppButton>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${d.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
            <PrintButton />
          </div>
        </Card>

        {/* إضافة رحلة لهذا السواق */}
        <Button asChild size="lg" className="w-full print:hidden">
          <Link href={`/trips/new?driver=${d.id}`}>
            <Plus className="h-5 w-5" /> إضافة رحلة لهذا السواق
          </Link>
        </Button>

        {/* علامة المراجعة اليومية */}
        <div className="print:hidden">
          <DailyReviewToggle
            reviewedToday={reviewedToday}
            action={setDriverReviewed.bind(null, d.id)}
          />
        </div>

        {/* فلتر الشهر */}
        <MonthFilter months={months} selected={selectedMonth} />

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="إجمالي المستحق" value={dueMonth} />
          <SummaryBox label="المدفوع" value={paidMonth} tone="success" />
          <SummaryBox label="المتبقي" value={remainingMonth} tone="warning" />
        </div>

        <AccountTotalSummary
          title={
            bounds ? `الحساب الشامل — ${monthLabel(selectedMonth)}` : "الحساب الشامل"
          }
          forParty={summaryFor}
          onParty={summaryOn}
          rows={[
            { label: "متبقي رحلات له", value: sRemaining, side: "for" },
            { label: "رصيد/سلف مكتب له", value: sOfficeFor, side: "for" },
            { label: "سلف خارجية له", value: sExternalFor, side: "for" },
            { label: "سلف مكتب عليه", value: sOfficeOn, side: "on" },
            { label: "سلف خارجية عليه", value: sExternalOn, side: "on" },
          ]}
        />

        <div className="print:hidden">
          <PayDriverForm
            driverId={d.id}
            remaining={remaining}
            advanceBalance={advanceBalance}
          />
        </div>

        {/* مقاصّة / تصفية الحساب */}
        {remaining > 0 && (externalOn > 0 || advanceBalance > 0) && (
          <div className="print:hidden">
            <OffsetAccountButton partyType="DRIVER" partyId={d.id} />
          </div>
        )}

        {/* بدء حساب جديد — يظهر لما يتساوى له وعليه */}
        {netDriver === 0 && visibleStatementRows.length > 0 && (
          <div className="print:hidden">
            <StartNewStatementButton partyType="DRIVER" partyId={d.id} />
          </div>
        )}

        {/* ربح إضافي + إكرامية */}
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <ExtraProfitForm partyType="DRIVER" partyId={d.id} />
          <TipForm partyType="DRIVER" partyId={d.id} />
        </div>
        <PartyAdjustments items={adjustments} />

        {/* السلف والأرصدة */}
        <AdvancePanel
          partyType="DRIVER"
          partyId={d.id}
          name={d.name}
          phone={d.phone}
          phones={[d.phone, d.altPhone, d.phone3]}
          balance={advanceBalance}
          advances={officeAdvances}
        />

        <ExternalAdvancePanel
          currentParty={{ type: "DRIVER", id: d.id, name: d.name }}
          parties={externalParties}
          advances={externalAdvances}
        />

        {/* تقرير واتساب دوري */}
        <Card className="space-y-2 p-4 print:hidden">
          <div className="text-sm font-bold text-muted-foreground">
            إرسال تقرير عبر واتساب
          </div>
          <div className="grid grid-cols-2 gap-2">
            {reports.map((r) => (
              <WhatsAppButton
                key={r.label}
                phones={[d.phone, d.altPhone, d.phone3]}
                message={r.message}
                variant="success"
                size="sm"
              >
                <MessageCircle className="h-4 w-4" /> تقرير {r.label}
              </WhatsAppButton>
            ))}
          </div>
        </Card>

        {/* كشف حساب مختصر: تاريخ • بيان • له • عليه • الرصيد الجاري + الفرق */}
        <PartyStatement
          title="كشف الحساب"
          rows={visibleStatementRows}
          clearedAt={clearedAt}
        />
      </div>
    </>
  );
}

function SummaryBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color}`}>
        {formatMoney(value)}
      </div>
    </Card>
  );
}
