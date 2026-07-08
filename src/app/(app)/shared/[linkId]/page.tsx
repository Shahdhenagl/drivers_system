import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdvancePanel } from "@/components/advance-panel";
import { ExternalAdvancePanel } from "@/components/external-advance-panel";
import { AccountTotalSummary } from "@/components/account-total-summary";
import { DailyReviewToggle } from "@/components/daily-review-toggle";
import { CollectAllForm } from "../../contractors/[id]/collect-all-form";
import { PayDriverForm } from "../../drivers/pay-driver-form";
import { MovementActions } from "../../trips/[id]/movement-actions";
import { SharedForm } from "../shared-form";
import { DeleteSharedButton } from "../delete-shared-button";
import { setSharedReviewed } from "../actions";
import { formatMoney } from "@/lib/money";
import { formatShortDate, sameCairoDay } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { effectiveAmounts } from "@/lib/finance";
import { methodLabel, TRIP_STATUS, EXTRA_PROFIT_METHOD, TIP_METHOD } from "@/lib/constants";
import { ExtraProfitForm } from "@/components/extra-profit-form";
import { TipForm } from "@/components/driver-tip-form";
import { PartyAdjustments } from "@/components/party-adjustments";
import { OffsetAccountButton } from "@/components/offset-account-button";
import {
  Phone,
  MessageCircle,
  Pencil,
  ArrowRight,
  ChevronLeft,
  UsersRound,
  Users,
  Truck,
  Plus,
} from "lucide-react";

export const dynamic = "force-dynamic";

type ExtRow = {
  amount: number;
  collectedAmount?: number;
  paidAmount?: number;
  status: string;
  lenderType: string;
  lenderId: string;
  borrowerType: string;
  borrowerId: string;
};

export default async function SharedProfile({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;

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

  const externalParties = [
    ...allContractors.map((p) => ({ type: "CONTRACTOR" as const, id: p.id, name: p.name, label: `مقاول - ${p.name}` })),
    ...allDrivers.map((p) => ({ type: "DRIVER" as const, id: p.id, name: p.name, label: `سواق - ${p.name}` })),
  ];

  // ===== جانب المقاول =====
  const cRequired = contractor.trips.reduce((a, t) => a + effectiveAmounts(t).contractor, 0);
  const cCollected = contractor.trips.reduce((a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0), 0);
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
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // ===== جانب السواق =====
  const dDue = driver.trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const dPaid = driver.payments.reduce((a, p) => a + p.amount, 0);
  const dRemaining = Math.max(dDue - dPaid, 0);
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

        {/* الحساب الموحّد */}
        <AccountTotalSummary
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
          <SummaryBox label="الآجل" value={cDeferred} tone="destructive" />
        </div>

        {cDeferred > 0 && (
          <div className="print:hidden">
            <CollectAllForm
              contractorId={contractor.id}
              remaining={cDeferred}
              advanceBalance={cAdvBalance}
              externalCredit={cExternalFor + dExternalFor}
            />
          </div>
        )}

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

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            رحلاته كمقاول ({contractor.trips.length})
          </h2>
          <div className="space-y-2">
            {contractor.trips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.startPoint} ← {t.endPoint}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)}{t.driver ? ` • ${t.driver.name}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-sm font-bold tabular-nums">{formatMoney(t.contractorPrice, false)}</div>
                      <Badge className="bg-muted text-[10px] text-muted-foreground">
                        {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                      </Badge>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
            {contractor.trips.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">لا توجد رحلات كمقاول</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل التحصيل ({contractorPayments.length})
          </h2>
          <Card className="divide-y divide-border">
            {contractorPayments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">لا توجد تحصيلات</p>
            ) : (
              contractorPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{p.route}</div>
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

        {/* ======================= جانب السواق ======================= */}
        <div className="flex items-center gap-2 pt-1 text-sm font-bold text-warning">
          <Truck className="h-4 w-4" /> كسواق
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="المستحق" value={dDue} />
          <SummaryBox label="المدفوع" value={dPaid} tone="success" />
          <SummaryBox label="المتبقي" value={dRemaining} tone="warning" />
        </div>

        <div className="print:hidden">
          <PayDriverForm
            driverId={driver.id}
            remaining={dRemaining}
            advanceBalance={dAdvBalance}
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

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            رحلاته كسواق ({driver.trips.length})
          </h2>
          <div className="space-y-2">
            {driver.trips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.startPoint} ← {t.endPoint}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)} • {t.contractor.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-sm font-bold tabular-nums text-warning">{formatMoney(t.driverDue, false)}</div>
                      <Badge className="bg-muted text-[10px] text-muted-foreground">
                        {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                      </Badge>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
            {driver.trips.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">لا توجد رحلات كسواق</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">سجل السداد ({driver.payments.length})</h2>
          <Card className="divide-y divide-border">
            {driver.payments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">لا توجد عمليات سداد</p>
            ) : (
              driver.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-success">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                      {p.trip?.contractor?.name ? ` • المقاول: ${p.trip.contractor.name}` : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.note ? p.note : p.trip ? `${p.trip.startPoint} ← ${p.trip.endPoint}` : ""}
                    </div>
                  </div>
                  <MovementActions
                    movement={{
                      id: p.id,
                      kind: "driverPayment",
                      label: p.trip ? `سداد — ${p.trip.startPoint} ← ${p.trip.endPoint}` : "سداد سواق",
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

/** صافي رصيد السلف: OUT − IN */
function advNet(rows: { direction: string; amount: number }[]) {
  const out = rows.filter((a) => a.direction === "OUT").reduce((s, a) => s + a.amount, 0);
  const inn = rows.filter((a) => a.direction === "IN").reduce((s, a) => s + a.amount, 0);
  return out - inn;
}

/** مجموع السلف الخارجية لطرف بدور معيّن — بقيمتها الكاملة (تُحسب فور تسجيلها) */
function extSum(
  rows: ExtRow[],
  role: "lender" | "borrower",
  type: string,
  id: string
) {
  return rows
    .filter((a) =>
      a.status !== "SETTLED" &&
      (role === "lender"
        ? a.lenderType === type && a.lenderId === id
        : a.borrowerType === type && a.borrowerId === id)
    )
    .reduce((s, a) => s + a.amount, 0);
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
