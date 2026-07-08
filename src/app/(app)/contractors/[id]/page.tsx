import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { ContractorForm } from "../contractor-form";
import { DeleteContractorButton } from "../delete-contractor-button";
import { AdvancePanel } from "@/components/advance-panel";
import { ExternalAdvancePanel } from "@/components/external-advance-panel";
import { AccountTotalSummary } from "@/components/account-total-summary";
import { DailyReviewToggle } from "@/components/daily-review-toggle";
import { MonthFilter } from "@/components/month-filter";
import { MovementActions } from "../../trips/[id]/movement-actions";
import { CollectAllForm } from "./collect-all-form";
import { setContractorReviewed } from "../actions";
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
import { contractorReport } from "@/lib/messages";
import { methodLabel, TRIP_STATUS } from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ChevronLeft,
  ArrowRight,
  Plus,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContractorProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m } = await searchParams;
  const c = await prisma.contractor.findUnique({
    where: { id },
    include: {
      trips: {
        orderBy: { date: "desc" },
        include: {
          driver: { select: { name: true } },
          collections: true,
        },
      },
    },
  });
  if (!c) notFound();

  // ===== فلتر الشهر — الافتراضي الشهر الحالي (يُخفي الأقدم تلقائيًا)، و"all" لكل الشهور =====
  const now = new Date();
  const currentMonth = cairoMonthStr(now);
  const monthSet = new Set<string>([currentMonth]);
  for (const t of c.trips) {
    monthSet.add(cairoMonthStr(t.date));
    for (const col of t.collections) monthSet.add(cairoMonthStr(col.date));
  }
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
  const trips = bounds
    ? c.trips.filter((t) => t.date >= bounds[0] && t.date < bounds[1])
    : c.trips;

  // علامة المراجعة اليومية (تتصفّر تلقائيًا كل يوم)
  const reviewedToday = c.lastReviewedAt
    ? sameCairoDay(c.lastReviewedAt, now)
    : false;

  // السلف/الأرصدة (مرنة لو الجدول غير موجود قبل الترحيل)
  const advances = await prisma.advance
    .findMany({
      where: { partyType: "CONTRACTOR", partyId: id },
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
            { borrowerType: "CONTRACTOR", borrowerId: id },
            { lenderType: "CONTRACTOR", lenderId: id },
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
  const advOut = advances
    .filter((a) => a.direction === "OUT")
    .reduce((s, a) => s + a.amount, 0);
  const advIn = advances
    .filter((a) => a.direction === "IN")
    .reduce((s, a) => s + a.amount, 0);
  const advanceBalance = advOut - advIn;
  // السلف الخارجية تُحسب بقيمتها الكاملة ما لم تُعلَّم "مسددة" (تبقى كسجل)
  const externalFor = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.lenderType === "CONTRACTOR" && a.lenderId === id)
    .reduce((s, a) => s + a.amount, 0);
  const externalOn = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.borrowerType === "CONTRACTOR" && a.borrowerId === id)
    .reduce((s, a) => s + a.amount, 0);
  const officeFor = Math.max(-advanceBalance, 0);
  const officeOn = Math.max(advanceBalance, 0);

  // تشمل الرحلات النشطة وغرامات الإلغاء (السماح = صفر) — مفلترة حسب الشهر المختار
  const totalRequired = trips.reduce(
    (a, t) => a + effectiveAmounts(t).contractor,
    0
  );
  const totalCollected = trips.reduce(
    (a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0),
    0
  );
  const totalDeferred = Math.max(totalRequired - totalCollected, 0);
  const totalProfit = trips.reduce((a, t) => {
    const e = effectiveAmounts(t);
    return a + (e.contractor - e.driver);
  }, 0);
  // الآجل الفعلي على كل الرحلات (كل الشهور) — يقود التحصيل والرصيد القائم، مستقل عن الفلتر
  const deferredAll = c.trips.reduce((a, t) => {
    const eff = effectiveAmounts(t).contractor;
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    return a + Math.max(eff - collected, 0);
  }, 0);
  const totalForContractor = officeFor + externalFor;
  const totalOnContractor = deferredAll + officeOn + externalOn;

  // الحساب الشامل يحترم فلتر الشهر: عند اختيار شهر يعرض صافي حركة الشهر فقط
  const inBounds = (d: Date) => !bounds || (d >= bounds[0] && d < bounds[1]);
  const mAdvBal =
    advances
      .filter((a) => a.direction === "OUT" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0) -
    advances
      .filter((a) => a.direction === "IN" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0);
  const mExternalFor = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.lenderType === "CONTRACTOR" && a.lenderId === id && inBounds(a.date))
    .reduce((s, a) => s + a.amount, 0);
  const mExternalOn = externalAdvances
    .filter((a) => a.status !== "SETTLED" && a.borrowerType === "CONTRACTOR" && a.borrowerId === id && inBounds(a.date))
    .reduce((s, a) => s + a.amount, 0);
  const sOfficeFor = bounds ? Math.max(-mAdvBal, 0) : officeFor;
  const sOfficeOn = bounds ? Math.max(mAdvBal, 0) : officeOn;
  const sExternalFor = bounds ? mExternalFor : externalFor;
  const sExternalOn = bounds ? mExternalOn : externalOn;
  const sDeferred = bounds ? totalDeferred : deferredAll;
  const summaryFor = sOfficeFor + sExternalFor;
  const summaryOn = sDeferred + sOfficeOn + sExternalOn;

  const payments = trips
    .flatMap((t) =>
      t.collections.map((p) => ({
        ...p,
        route: `${t.startPoint} ← ${t.endPoint}`,
        driverName: t.driver?.name ?? "—",
      }))
    )
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // تقارير واتساب دورية
  const reportPeriods = [
    { label: "أسبوعي", from: startOfDay(addDays(now, -6)), to: endOfDay(now) },
    { label: "شهري", from: startOfDay(addDays(now, -29)), to: endOfDay(now) },
  ];
  const reports = reportPeriods.map((p) => {
    const inP = c.trips.filter((t) => t.date >= p.from && t.date <= p.to);
    const total = inP.reduce((a, t) => a + effectiveAmounts(t).contractor, 0);
    const settled = inP.reduce(
      (a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0),
      0
    );
    const msg = contractorReport({
      name: c.name,
      periodLabel: p.label,
      from: p.from,
      to: p.to,
      tripsCount: inP.length,
      total,
      settled,
      remainingTotal: deferredAll,
      advanceBalance,
      externalFor,
      externalOn,
    });
    return { label: p.label, message: msg };
  });

  return (
    <>
      <AppHeader title="ملف المقاول" />
      <div className="space-y-4 py-3 print:py-0">
        <Link
          href="/contractors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للقائمة
        </Link>

        {/* الترويسة */}
        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                {c.name.charAt(0)}
              </div>
              <div>
                <div className="text-lg font-bold">{c.name}</div>
                {c.company && (
                  <div className="text-sm text-muted-foreground">{c.company}</div>
                )}
                <div className="text-sm text-muted-foreground">
                  {displayPhone(c.phone)}
                </div>
                {c.altPhone && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(c.altPhone)} (إضافي)
                  </div>
                )}
                {c.phone3 && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(c.phone3)} (إضافي)
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <ContractorForm
                contractor={c}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <DeleteContractorButton id={c.id} />
            </div>
          </div>
          {c.notes && (
            <p className="rounded-lg bg-muted p-2 text-sm">{c.notes}</p>
          )}
          <div className="flex gap-2 print:hidden">
            <WhatsAppButton
              phones={[c.phone, c.altPhone, c.phone3]}
              message={`مرحبًا أ. ${c.name}`}
              variant="success"
              size="sm"
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </WhatsAppButton>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${c.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
            <PrintButton />
          </div>
        </Card>

        {/* إضافة رحلة لهذا المقاول */}
        <Button asChild size="lg" className="w-full print:hidden">
          <Link href={`/trips/new?contractor=${c.id}`}>
            <Plus className="h-5 w-5" /> إضافة رحلة لهذا المقاول
          </Link>
        </Button>

        {/* علامة المراجعة اليومية */}
        <div className="print:hidden">
          <DailyReviewToggle
            reviewedToday={reviewedToday}
            action={setContractorReviewed.bind(null, c.id)}
          />
        </div>

        {/* فلتر الشهر */}
        <MonthFilter months={months} selected={selectedMonth} />

        {/* الملخص المالي */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryBox label="إجمالي المطلوب" value={totalRequired} />
          <SummaryBox label="إجمالي المحصّل" value={totalCollected} tone="success" />
          <SummaryBox label="إجمالي الآجل" value={totalDeferred} tone="destructive" />
          <SummaryBox label="أرباحنا منه" value={totalProfit} tone="primary" />
        </div>

        <AccountTotalSummary
          title={
            bounds ? `الحساب الشامل — ${monthLabel(selectedMonth)}` : "الحساب الشامل"
          }
          forParty={summaryFor}
          onParty={summaryOn}
          rows={[
            { label: "رصيد/سلف مكتب له", value: sOfficeFor, side: "for" },
            { label: "سلف خارجية له", value: sExternalFor, side: "for" },
            { label: "متبقي رحلات عليه", value: sDeferred, side: "on" },
            { label: "سلف مكتب عليه", value: sOfficeOn, side: "on" },
            { label: "سلف خارجية عليه", value: sExternalOn, side: "on" },
          ]}
        />

        {/* تحصيل الكل */}
        {deferredAll > 0 && (
          <div className="print:hidden">
            <CollectAllForm
              contractorId={c.id}
              remaining={deferredAll}
              advanceBalance={advanceBalance}
              externalCredit={externalFor}
            />
          </div>
        )}

        {/* السلف والأرصدة */}
        <AdvancePanel
          partyType="CONTRACTOR"
          partyId={c.id}
          name={c.name}
          phone={c.phone}
          phones={[c.phone, c.altPhone, c.phone3]}
          balance={advanceBalance}
          advances={advances}
        />

        <ExternalAdvancePanel
          currentParty={{ type: "CONTRACTOR", id: c.id, name: c.name }}
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
                phones={[c.phone, c.altPhone, c.phone3]}
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
            {trips.map((t) => {
              const collected = t.collections.reduce((s, x) => s + x.amount, 0);
              return (
                <Link key={t.id} href={`/trips/${t.id}`}>
                  <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {t.startPoint} ← {t.endPoint}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatShortDate(t.date)}
                        {t.driver ? ` • ${t.driver.name}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-left">
                        <div className="text-sm font-bold tabular-nums">
                          {formatMoney(t.contractorPrice, false)}
                        </div>
                        <Badge className="bg-muted text-[10px] text-muted-foreground">
                          {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                        </Badge>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Card>
                </Link>
              );
            })}
            {trips.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد رحلات في هذا الشهر
              </p>
            )}
          </div>
        </section>

        {/* سجل المدفوعات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل المدفوعات ({payments.length})
          </h2>
          <Card className="divide-y divide-border">
            {payments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد مدفوعات
              </p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                      {p.driverName ? ` • السواق: ${p.driverName}` : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.route}
                    </div>
                  </div>
                  <MovementActions
                    movement={{
                      id: p.id,
                      kind: "collection",
                      label: `تحصيل — ${p.route}`,
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
  tone?: "default" | "success" | "destructive" | "primary";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>
        {formatMoney(value)}
      </div>
    </Card>
  );
}
