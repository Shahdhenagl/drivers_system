import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { DriverForm } from "../driver-form";
import { DeleteDriverButton } from "../delete-driver-button";
import { PayDriverForm } from "../pay-driver-form";
import { AdvancePanel } from "@/components/advance-panel";
import { ExternalAdvancePanel } from "@/components/external-advance-panel";
import { AccountTotalSummary } from "@/components/account-total-summary";
import { DailyReviewToggle } from "@/components/daily-review-toggle";
import { MonthFilter } from "@/components/month-filter";
import { MovementActions } from "../../trips/[id]/movement-actions";
import { ExtraProfitForm } from "@/components/extra-profit-form";
import { DriverTipForm } from "@/components/driver-tip-form";
import { OffsetAccountButton } from "@/components/offset-account-button";
import { setDriverReviewed } from "../actions";
import { formatMoney } from "@/lib/money";
import {
  formatShortDate,
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
import { driverReport } from "@/lib/messages";
import { methodLabel, TRIP_STATUS } from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ChevronLeft,
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
  const extraProfits = await prisma.ledgerEntry
    .findMany({
      where: { type: "EXTRA_PROFIT", refType: "Driver", refId: id },
      orderBy: { date: "desc" },
    })
    .catch(() => [] as { id: string; amount: number; method: string; description: string; date: Date }[]);
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

  // تقارير واتساب دورية
  const reportPeriods = [
    { label: "أسبوعي", from: startOfDay(addDays(now, -6)), to: endOfDay(now) },
    { label: "شهري", from: startOfDay(addDays(now, -29)), to: endOfDay(now) },
  ];
  const reports = reportPeriods.map((p) => {
    const inP = d.trips.filter((t) => t.date >= p.from && t.date <= p.to);
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
      <div className="space-y-4 py-3">
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

        {/* ربح إضافي + إكرامية */}
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <ExtraProfitForm partyType="DRIVER" partyId={d.id} />
          <DriverTipForm driverId={d.id} />
        </div>
        {extraProfits.length > 0 && (
          <Card className="divide-y divide-border">
            <div className="px-3 py-2 text-xs font-bold text-muted-foreground">
              أرباح إضافية ({extraProfits.length})
            </div>
            {extraProfits.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-primary">{formatMoney(e.amount)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatShortDate(e.date)} • {methodLabel(e.method)}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* السلف والأرصدة */}
        <AdvancePanel
          partyType="DRIVER"
          partyId={d.id}
          name={d.name}
          phone={d.phone}
          phones={[d.phone, d.altPhone, d.phone3]}
          balance={advanceBalance}
          advances={advances}
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

        {/* الرحلات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            الرحلات ({trips.length})
          </h2>
          <div className="space-y-2">
            {trips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {t.startPoint} ← {t.endPoint}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)} • {t.contractor.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-sm font-bold tabular-nums text-warning">
                        {formatMoney(t.driverDue, false)}
                      </div>
                      <Badge className="bg-muted text-[10px] text-muted-foreground">
                        {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                      </Badge>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
            {trips.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد رحلات في هذا الشهر
              </p>
            )}
          </div>
        </section>

        {/* سجل السداد */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل السداد ({monthPayments.length})
          </h2>
          <Card className="divide-y divide-border">
            {monthPayments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد عمليات سداد في هذا الشهر
              </p>
            ) : (
              monthPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-success">
                      {formatMoney(p.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                      {p.trip?.contractor?.name
                        ? ` • المقاول: ${p.trip.contractor.name}`
                        : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.note
                        ? p.note
                        : p.trip
                          ? `${p.trip.startPoint} ← ${p.trip.endPoint}`
                          : ""}
                    </div>
                  </div>
                  <MovementActions
                    movement={{
                      id: p.id,
                      kind: "driverPayment",
                      label: p.trip
                        ? `سداد — ${p.trip.startPoint} ← ${p.trip.endPoint}`
                        : "سداد سواق",
                      amount: p.amount,
                      method: p.method,
                      note: p.note,
                      date: p.date,
                    }}
                  />
                </div>
              ))
            )}
          </Card>
        </section>
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
