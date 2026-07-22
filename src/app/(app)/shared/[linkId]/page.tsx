import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdvancePanel } from "@/components/advance-panel";
import { ExternalAdvancePanel } from "@/components/external-advance-panel";
import { AccountTotalSummary } from "@/components/account-total-summary";
import { DailyReviewToggle } from "@/components/daily-review-toggle";
import { WeekFilter } from "@/components/week-filter";
import { CollectAllForm } from "../../contractors/[id]/collect-all-form";
import { PayDriverForm } from "../../drivers/pay-driver-form";
import { PartyStatement } from "@/components/party-statement";
import { StartNewStatementButton } from "@/components/start-new-statement-button";
import type { StatementRow } from "@/components/party-print-statement";
import { stripMarkers } from "@/lib/statement-group";
import { SharedForm } from "../shared-form";
import { DeleteSharedButton } from "../delete-shared-button";
import { setSharedReviewed } from "../actions";
import { formatMoney } from "@/lib/money";
import {
  sameCairoDay,
  cairoWeekStr,
  weekBounds,
  weekLabel,
  weekOptionLabel,
} from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { effectiveAmounts } from "@/lib/finance";
import { owedByBorrower, owedToLender } from "@/lib/external-legs";
import {
  EXTRA_PROFIT_METHOD,
  TIP_METHOD,
  methodLabel,
  TRIP_STATUS,
  tripStatus,
  isSystemAdvanceMethod,
} from "@/lib/constants";
import { ExtraProfitForm } from "@/components/extra-profit-form";
import { TipForm } from "@/components/driver-tip-form";
import { PartyAdjustments } from "@/components/party-adjustments";
import { OffsetAccountButton } from "@/components/offset-account-button";
import {
  Phone,
  MessageCircle,
  Pencil,
  ArrowRight,
  UsersRound,
  Users,
  Truck,
  Plus,
} from "lucide-react";

export const dynamic = "force-dynamic";

type ExtRow = {
  amount: number;
  collectedAmount?: number | null;
  paidAmount?: number | null;
  status: string;
  lenderType: string;
  lenderId: string;
  borrowerType: string;
  borrowerId: string;
};

export default async function SharedProfile({
  params,
  searchParams,
}: {
  params: Promise<{ linkId: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { linkId } = await params;
  const { w } = await searchParams;

  const [contractor, driver] = await Promise.all([
    prisma.contractor.findFirst({
      where: { linkId },
      include: {
        trips: {
          orderBy: { date: "desc" },
          include: { driver: { select: { name: true } }, collections: true },
        },
      },
    }),
    prisma.driver.findFirst({
      where: { linkId },
      include: {
        trips: {
          orderBy: { date: "desc" },
          include: { contractor: { select: { name: true } }, driverPayments: true },
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
    }),
  ]);
  if (!contractor || !driver) notFound();

  const [
    contractorAdvances,
    driverAdvances,
    contractorExternals,
    driverExternals,
    allContractors,
    allDrivers,
  ] = await Promise.all([
    prisma.advance
      .findMany({ where: { partyType: "CONTRACTOR", partyId: contractor.id }, orderBy: { date: "desc" } })
      .catch(() => []),
    prisma.advance
      .findMany({ where: { partyType: "DRIVER", partyId: driver.id }, orderBy: { date: "desc" } })
      .catch(() => []),
    prisma.externalAdvance
      .findMany({
        where: { OR: [{ borrowerType: "CONTRACTOR", borrowerId: contractor.id }, { lenderType: "CONTRACTOR", lenderId: contractor.id }] },
        orderBy: [{ status: "asc" }, { date: "desc" }],
      })
      .catch(() => []),
    prisma.externalAdvance
      .findMany({
        where: { OR: [{ borrowerType: "DRIVER", borrowerId: driver.id }, { lenderType: "DRIVER", lenderId: driver.id }] },
        orderBy: [{ status: "asc" }, { date: "desc" }],
      })
      .catch(() => []),
    prisma.contractor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.driver.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // ===== فلتر الأسبوع (السبت → الجمعة) — الافتراضي الأسبوع الحالي، و"all" لكل الفترات =====
  const currentWeek = cairoWeekStr();
  const weekSet = new Set<string>([currentWeek]);
  for (const t of contractor.trips) {
    weekSet.add(cairoWeekStr(t.date));
    for (const col of t.collections) weekSet.add(cairoWeekStr(col.date));
  }
  for (const t of driver.trips) weekSet.add(cairoWeekStr(t.date));
  for (const p of driver.payments) weekSet.add(cairoWeekStr(p.date));
  for (const a of [...contractorAdvances, ...driverAdvances])
    weekSet.add(cairoWeekStr(a.date));
  for (const a of [...contractorExternals, ...driverExternals])
    weekSet.add(cairoWeekStr(a.date));
  const weeks = [
    { value: "all", label: "كل الفترات" },
    ...[...weekSet]
      .sort()
      .reverse()
      .map((v) => ({ value: v, label: weekOptionLabel(v, currentWeek) })),
  ];
  const selectedWeek =
    w === "all" ? "all" : w && weeks.some((x) => x.value === w) ? w : currentWeek;
  const bounds = selectedWeek === "all" ? null : weekBounds(selectedWeek);
  const inWeek = (dt: Date) => !bounds || (dt >= bounds[0] && dt < bounds[1]);
  const periodLabel = bounds ? `أسبوع ${weekLabel(selectedWeek)}` : "كل الفترات";

  // الحركات ضمن الفترة المختارة (الملخصات وكشوف الحساب تتبع الفلتر)
  const cTrips = contractor.trips.filter((t) => inWeek(t.date));
  const dTrips = driver.trips.filter((t) => inWeek(t.date));
  const dPayments = driver.payments.filter((p) => inWeek(p.date));
  const cAdvancesW = contractorAdvances.filter((a) => inWeek(a.date));
  const dAdvancesW = driverAdvances.filter((a) => inWeek(a.date));

  const externalParties = [
    ...allContractors.map((p) => ({ type: "CONTRACTOR" as const, id: p.id, name: p.name, label: `مقاول - ${p.name}` })),
    ...allDrivers.map((p) => ({ type: "DRIVER" as const, id: p.id, name: p.name, label: `سواق - ${p.name}` })),
  ];

  // ===== جانب المقاول =====
  const cRequired = cTrips.reduce((a, t) => a + effectiveAmounts(t).contractor, 0);
  const cCollected = cTrips.reduce((a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0), 0);
  const cDeferredWeek = cTrips.reduce((a, t) => {
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    return a + Math.max(effectiveAmounts(t).contractor - collected, 0);
  }, 0);
  // الآجل الكامل (كل الفترات) — يدخل في الحساب الموحّد وأزرار التحصيل
  const cDeferred = contractor.trips.reduce((a, t) => {
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    return a + Math.max(effectiveAmounts(t).contractor - collected, 0);
  }, 0);
  const cAdvBalance = advNet(contractorAdvances);
  const isAdjustment = (m: string) => m === EXTRA_PROFIT_METHOD || m === TIP_METHOD;
  const cAdjustments = contractorAdvances.filter((a) => isAdjustment(a.method));
  const cOfficeAdvances = contractorAdvances.filter((a) => !isAdjustment(a.method));
  const dAdjustments = driverAdvances.filter((a) => isAdjustment(a.method));
  const dOfficeAdvances = driverAdvances.filter((a) => !isAdjustment(a.method));
  const cExternalFor = extSum(contractorExternals, "lender", "CONTRACTOR", contractor.id);
  const cExternalOn = extSum(contractorExternals, "borrower", "CONTRACTOR", contractor.id);
  const contractorPayments = contractor.trips
    .flatMap((t) =>
      t.collections.map((p) => ({ ...p, route: `${t.startPoint} ← ${t.endPoint}` }))
    )
    .filter((p) => inWeek(p.date))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // ===== جانب السواق =====
  const dDue = dTrips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const dPaid = dPayments.reduce((a, p) => a + p.amount, 0);
  const dRemainingWeek = Math.max(dDue - dPaid, 0);
  // المتبقي الكامل (كل الفترات) — يدخل في الحساب الموحّد وزر السداد
  const dRemaining = Math.max(
    driver.trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0) -
      driver.payments.reduce((a, p) => a + p.amount, 0),
    0
  );
  const dAdvBalance = advNet(driverAdvances);
  const dExternalFor = extSum(driverExternals, "lender", "DRIVER", driver.id);
  const dExternalOn = extSum(driverExternals, "borrower", "DRIVER", driver.id);

  // ===== الحساب الموحّد =====
  const officeFor = Math.max(-cAdvBalance, 0) + Math.max(-dAdvBalance, 0);
  const officeOn = Math.max(cAdvBalance, 0) + Math.max(dAdvBalance, 0);
  const forParty = dRemaining + officeFor + cExternalFor + dExternalFor;
  const onParty = cDeferred + officeOn + cExternalOn + dExternalOn;

  const reviewedToday = contractor.lastReviewedAt
    ? sameCairoDay(contractor.lastReviewedAt, new Date())
    : false;

  // ===== كشف الحساب المختصر لكل جانب =====
  const cStatementRows: StatementRow[] = [
    ...cTrips.map((t) => ({
      id: `ctrip-${t.id}`,
      date: t.date,
      description: `رحلة ${t.startPoint} ← ${t.endPoint}`,
      details: `${t.driver ? `السواق: ${t.driver.name} • ` : ""}${TRIP_STATUS[tripStatus(t.status)]}`,
      onParty: effectiveAmounts(t).contractor,
    })),
    ...contractorPayments.map((p) => ({
      id: `collection-${p.id}`,
      date: p.date,
      description: `تحصيل من المقاول - ${methodLabel(p.method)}`,
      details: p.route,
      paid: p.amount,
      groupKey: `col|${p.method}|${+p.date}|${p.note ?? ""}`,
      createdAt: p.createdAt,
    })),
    ...cAdvancesW.map((a) => ({
      id: `cadvance-${a.id}`,
      date: a.date,
      description:
        a.direction === "OUT"
          ? `استلم من المكتب - ${methodLabel(a.method)}`
          : `دفع للمكتب - ${methodLabel(a.method)}`,
      details: stripMarkers(a.note),
      onParty: a.direction === "OUT" ? a.amount : undefined,
      paid: a.direction === "IN" ? a.amount : undefined,
      received: a.direction === "OUT" ? a.amount : undefined,
      groupKey: isSystemAdvanceMethod(a.method)
        ? `adv|${a.direction}|${a.method}|${+a.date}`
        : null,
      createdAt: a.createdAt,
    })),
    ...externalStatementRows(
      contractorExternals,
      "CONTRACTOR",
      contractor.id,
      "c",
      inWeek
    ),
  ];
  const dStatementRows: StatementRow[] = [
    ...dTrips.map((t) => ({
      id: `dtrip-${t.id}`,
      date: t.date,
      description: `رحلة ${t.startPoint} ← ${t.endPoint}`,
      details: `المقاول: ${t.contractor.name} • ${TRIP_STATUS[tripStatus(t.status)]}`,
      forParty: effectiveAmounts(t).driver,
    })),
    ...dPayments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.date,
      description: `سداد للسواق - ${methodLabel(p.method)}`,
      details: p.trip
        ? `${p.trip.startPoint} ← ${p.trip.endPoint}${p.note ? ` • ${p.note}` : ""}`
        : p.note,
      received: p.amount,
      groupKey: `dp|${p.method}|${+p.date}|${p.note ?? ""}`,
      createdAt: p.createdAt,
    })),
    ...dAdvancesW.map((a) => ({
      id: `dadvance-${a.id}`,
      date: a.date,
      description:
        a.direction === "OUT"
          ? `استلم من المكتب - ${methodLabel(a.method)}`
          : `دفع للمكتب - ${methodLabel(a.method)}`,
      details: stripMarkers(a.note),
      onParty: a.direction === "OUT" ? a.amount : undefined,
      paid: a.direction === "IN" ? a.amount : undefined,
      received: a.direction === "OUT" ? a.amount : undefined,
      groupKey: isSystemAdvanceMethod(a.method)
        ? `adv|${a.direction}|${a.method}|${+a.date}`
        : null,
      createdAt: a.createdAt,
    })),
    ...externalStatementRows(driverExternals, "DRIVER", driver.id, "d", inWeek),
  ];
  const cClearedAt =
    (contractor as { statementClearedAt?: Date | null }).statementClearedAt ?? null;
  const dClearedAt =
    (driver as { statementClearedAt?: Date | null }).statementClearedAt ?? null;
  const cVisibleRows = cClearedAt
    ? cStatementRows.filter((r) => +r.date >= +cClearedAt)
    : cStatementRows;
  const dVisibleRows = dClearedAt
    ? dStatementRows.filter((r) => +r.date >= +dClearedAt)
    : dStatementRows;
  const cRowsNet = stmtNet(cVisibleRows);
  const dRowsNet = stmtNet(dVisibleRows);

  const phones = [contractor.phone, contractor.altPhone, contractor.phone3];
  const sharedData = {
    linkId,
    name: contractor.name,
    phone: contractor.phone,
    altPhone: contractor.altPhone,
    phone3: contractor.phone3,
    company: contractor.company,
    vehicleType: driver.vehicleType,
    vehicleNumber: driver.vehicleNumber,
    notes: contractor.notes,
  };

  return (
    <>
      <AppHeader title="ملف مشترك" />
      <div className="space-y-4 py-3">
        <Link href="/shared" className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden">
          <ArrowRight className="h-4 w-4" />
          رجوع للقائمة
        </Link>

        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
                <UsersRound className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{contractor.name}</span>
                  <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                    مشترك
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  سواق ومقاول • {driver.vehicleType}
                  {driver.vehicleNumber ? ` • ${driver.vehicleNumber}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">{displayPhone(contractor.phone)}</div>
                {contractor.altPhone && (
                  <div className="text-sm text-muted-foreground">{displayPhone(contractor.altPhone)} (إضافي)</div>
                )}
                {contractor.phone3 && (
                  <div className="text-sm text-muted-foreground">{displayPhone(contractor.phone3)} (إضافي)</div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <SharedForm
                shared={sharedData}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <DeleteSharedButton linkId={linkId} />
            </div>
          </div>
          {contractor.notes && <p className="rounded-lg bg-muted p-2 text-sm">{contractor.notes}</p>}
          <div className="flex gap-2 print:hidden">
            <WhatsAppButton phones={phones} message={`مرحبًا ${contractor.name}`} variant="success" size="sm" className="flex-1">
              <MessageCircle className="h-4 w-4" />
              واتساب
            </WhatsAppButton>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${contractor.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
          </div>
        </Card>

        {/* إضافة رحلة — اختَر الدور أولًا */}
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <Button asChild size="lg">
            <Link href={`/trips/new?contractor=${contractor.id}`}>
              <Plus className="h-5 w-5" /> رحلة كمقاول
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/trips/new?driver=${driver.id}`}>
              <Plus className="h-5 w-5" /> رحلة كسواق
            </Link>
          </Button>
        </div>

        {/* علامة المراجعة اليومية */}
        <div className="print:hidden">
          <DailyReviewToggle reviewedToday={reviewedToday} action={setSharedReviewed.bind(null, linkId)} />
        </div>

        {/* فلتر الأسبوع (السبت → الجمعة) */}
        <WeekFilter weeks={weeks} selected={selectedWeek} />

        {/* الحساب الموحّد — رصيد كامل لا يتأثر بالفلتر */}
        <AccountTotalSummary
          title="الحساب الموحّد (كل الفترات)"
          forParty={forParty}
          onParty={onParty}
          rows={[
            { label: "متبقي رحلات له (كسواق)", value: dRemaining, side: "for" },
            { label: "رصيد/سلف مكتب له", value: officeFor, side: "for" },
            { label: "سلف خارجية له", value: cExternalFor + dExternalFor, side: "for" },
            { label: "متبقي رحلات عليه (كمقاول)", value: cDeferred, side: "on" },
            { label: "سلف مكتب عليه", value: officeOn, side: "on" },
            { label: "سلف خارجية عليه", value: cExternalOn + dExternalOn, side: "on" },
          ]}
        />

        {/* ======================= جانب المقاول ======================= */}
        <div className="flex items-center gap-2 pt-1 text-sm font-bold text-primary">
          <Users className="h-4 w-4" /> كمقاول
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="المطلوب" value={cRequired} />
          <SummaryBox label="المحصّل" value={cCollected} tone="success" />
          <SummaryBox label="الآجل" value={cDeferredWeek} tone="destructive" />
        </div>

        <div className="print:hidden">
          <CollectAllForm
            contractorId={contractor.id}
            remaining={cDeferred}
            advanceBalance={cAdvBalance}
            externalCredit={cExternalFor}
            externalDebt={cExternalOn}
          />
        </div>

        {cDeferred > 0 && (cExternalFor > 0 || cAdvBalance < 0) && (
          <div className="print:hidden">
            <OffsetAccountButton partyType="CONTRACTOR" partyId={contractor.id} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 print:hidden">
          <ExtraProfitForm partyType="CONTRACTOR" partyId={contractor.id} />
          <TipForm partyType="CONTRACTOR" partyId={contractor.id} />
        </div>
        <PartyAdjustments items={cAdjustments} />

        <AdvancePanel
          partyType="CONTRACTOR"
          partyId={contractor.id}
          name={contractor.name}
          phone={contractor.phone}
          phones={phones}
          balance={cAdvBalance}
          advances={cOfficeAdvances}
        />

        <ExternalAdvancePanel
          currentParty={{ type: "CONTRACTOR", id: contractor.id, name: contractor.name }}
          parties={externalParties}
          advances={contractorExternals}
        />

        {cRowsNet === 0 && cVisibleRows.length > 0 && (
          <div className="print:hidden">
            <StartNewStatementButton partyType="CONTRACTOR" partyId={contractor.id} />
          </div>
        )}

        <PartyStatement
          title={`كشف الحساب (كمقاول) — ${periodLabel}`}
          rows={cVisibleRows}
          clearedAt={cClearedAt}
        />

        {/* ======================= جانب السواق ======================= */}
        <div className="flex items-center gap-2 pt-1 text-sm font-bold text-warning">
          <Truck className="h-4 w-4" /> كسواق
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="المستحق" value={dDue} />
          <SummaryBox label="المدفوع" value={dPaid} tone="success" />
          <SummaryBox label="المتبقي" value={dRemainingWeek} tone="warning" />
        </div>

        <div className="print:hidden">
          <PayDriverForm
            driverId={driver.id}
            remaining={dRemaining}
            advanceBalance={dAdvBalance}
            externalCredit={dExternalFor}
            externalDebt={dExternalOn}
          />
        </div>

        {dRemaining > 0 && (dExternalOn > 0 || dAdvBalance > 0) && (
          <div className="print:hidden">
            <OffsetAccountButton partyType="DRIVER" partyId={driver.id} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 print:hidden">
          <ExtraProfitForm partyType="DRIVER" partyId={driver.id} />
          <TipForm partyType="DRIVER" partyId={driver.id} />
        </div>
        <PartyAdjustments items={dAdjustments} />

        <AdvancePanel
          partyType="DRIVER"
          partyId={driver.id}
          name={driver.name}
          phone={driver.phone}
          phones={phones}
          balance={dAdvBalance}
          advances={dOfficeAdvances}
        />

        <ExternalAdvancePanel
          currentParty={{ type: "DRIVER", id: driver.id, name: driver.name }}
          parties={externalParties}
          advances={driverExternals}
        />

        {dRowsNet === 0 && dVisibleRows.length > 0 && (
          <div className="print:hidden">
            <StartNewStatementButton partyType="DRIVER" partyId={driver.id} />
          </div>
        )}

        <PartyStatement
          title={`كشف الحساب (كسواق) — ${periodLabel}`}
          rows={dVisibleRows}
          clearedAt={dClearedAt}
        />
      </div>
    </>
  );
}

/**
 * صفوف السلف الخارجية في كشف الحساب: سطر التسجيل + سطر التسوية (لو اتحصّلت/اتسلّمت)
 * فيتصفّر السطر لما الطرف يدفع اللي عليه أو يستلم اللي له.
 */
function externalStatementRows(
  rows: {
    id: string;
    amount: number;
    collectedAmount?: number | null;
    paidAmount?: number | null;
    borrowerType: string;
    borrowerId: string;
    borrowerName: string;
    lenderType: string;
    lenderId: string;
    lenderName: string;
    date: Date;
    updatedAt: Date;
    note: string | null;
  }[],
  partyType: "CONTRACTOR" | "DRIVER",
  partyId: string,
  prefix: string,
  inWeek: (d: Date) => boolean
): StatementRow[] {
  const out: StatementRow[] = [];
  for (const a of rows) {
    const isBorrower = a.borrowerType === partyType && a.borrowerId === partyId;
    if (inWeek(a.date)) {
      out.push({
        id: `${prefix}external-${a.id}`,
        date: a.date,
        description: isBorrower
          ? `استلم سلفة خارجية من ${a.lenderName}`
          : `دفع سلفة خارجية إلى ${a.borrowerName}`,
        details: a.note ?? undefined,
        forParty: isBorrower ? undefined : a.amount,
        onParty: isBorrower ? a.amount : undefined,
        paid: isBorrower ? undefined : a.amount,
        received: isBorrower ? a.amount : undefined,
      });
    }
    const settled = isBorrower ? a.collectedAmount ?? 0 : a.paidAmount ?? 0;
    if (settled > 0 && inWeek(a.updatedAt)) {
      out.push({
        id: `${prefix}external-leg-${a.id}`,
        date: a.updatedAt,
        description: isBorrower
          ? "سدّد سلفة خارجية للمكتب"
          : "استلم سلفة خارجية من المكتب",
        details: isBorrower ? `لصالح ${a.lenderName}` : `من ${a.borrowerName}`,
        paid: isBorrower ? settled : undefined,
        received: isBorrower ? undefined : settled,
      });
    }
  }
  return out;
}

/** صافي كشف الحساب من الصفوف: + = له، − = عليه (نفس حساب مكوّن الكشف) */
function stmtNet(rows: StatementRow[]) {
  return rows.reduce(
    (s, r) => s + ((r.forParty ?? r.paid ?? 0) - (r.onParty ?? r.received ?? 0)),
    0
  );
}

/** صافي رصيد السلف: OUT − IN */
function advNet(rows: { direction: string; amount: number }[]) {
  const out = rows.filter((a) => a.direction === "OUT").reduce((s, a) => s + a.amount, 0);
  const inn = rows.filter((a) => a.direction === "IN").reduce((s, a) => s + a.amount, 0);
  return out - inn;
}

/** مجموع الباقي من السلف الخارجية لطرف بدور معيّن (يتصفّر بالتحصيل/التسليم) */
function extSum(
  rows: ExtRow[],
  role: "lender" | "borrower",
  type: string,
  id: string
) {
  return rows
    .filter((a) =>
      role === "lender"
        ? a.lenderType === type && a.lenderId === id
        : a.borrowerType === type && a.borrowerId === id
    )
    .reduce((s, a) => s + (role === "lender" ? owedToLender(a) : owedByBorrower(a)), 0);
}

function SummaryBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color}`}>{formatMoney(value)}</div>
    </Card>
  );
}
