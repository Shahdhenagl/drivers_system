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
import { WeekFilter } from "@/components/week-filter";
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
  cairoWeekStr,
  weekLabel,
  weekOptionLabel,
  weekBounds,
  sameCairoDay,
} from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { effectiveAmounts } from "@/lib/finance";
import { owedByBorrower, owedToLender } from "@/lib/external-legs";
import { advanceRowAction } from "@/lib/statement-actions";
import { stripMarkers } from "@/lib/statement-group";
import { driverReport } from "@/lib/messages";
import {
  COMPANY_NAME,
  collectorNameFromMethod,
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
  searchParams: Promise<{ w?: string }>;
}) {
  const { id } = await params;
  const { w } = await searchParams;
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

  // ===== فلتر الأسبوع (السبت → الجمعة) — الافتراضي الأسبوع الحالي، و"all" لكل الفترات =====
  const now = new Date();
  const currentWeek = cairoWeekStr(now);
  const weekSet = new Set<string>([currentWeek]);
  for (const t of d.trips) weekSet.add(cairoWeekStr(t.date));
  for (const p of d.payments) weekSet.add(cairoWeekStr(p.date));
  const weeks = [
    { value: "all", label: "كل الفترات" },
    ...[...weekSet]
      .sort()
      .reverse()
      .map((v) => ({ value: v, label: weekOptionLabel(v, currentWeek) })),
  ];
  const selectedWeek =
    w === "all"
      ? "all"
      : w && weeks.some((x) => x.value === w)
        ? w
        : currentWeek;
  const bounds = selectedWeek === "all" ? null : weekBounds(selectedWeek);
  const inWeek = (dt: Date) => !bounds || (dt >= bounds[0] && dt < bounds[1]);
  const trips = bounds ? d.trips.filter((t) => inWeek(t.date)) : d.trips;
  const weekPayments = bounds
    ? d.payments.filter((p) => inWeek(p.date))
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
          createdAt: Date;
          tripId: string | null;
          sourceName: string | null;
        }[]
    );
  // حركات المحصّل ("عن طريق فلان") ناتجة عن تحصيل من مقاول أو سداد لسواق.
  // في ملف المحصّل نفسه اسمه بلا فائدة — المطلوب اسم الطرف اللي دفع أو استلم.
  // نوصل له بثلاث طرق حسب المتاح في السجل: الاسم المحفوظ، علامة الربط في
  // الملاحظة ([c:dp:] سداد / [c:col:] تحصيل)، أو الرحلة المرتبطة.
  const collectorAdvances = advances.filter((a) =>
    collectorNameFromMethod(a.method)
  );
  const markerIds = (kind: "dp" | "col") => [
    ...new Set(
      collectorAdvances
        .map((a) => a.note?.match(new RegExp(`\\[c:${kind}:([^\\]]+)\\]`))?.[1])
        .filter((v): v is string => Boolean(v))
    ),
  ];
  const paymentIds = markerIds("dp");
  const collectionIds = markerIds("col");
  const advanceTripIds = [
    ...new Set(
      collectorAdvances.map((a) => a.tripId).filter((v): v is string => Boolean(v))
    ),
  ];

  const tripSelect = {
    startPoint: true,
    endPoint: true,
    contractor: { select: { name: true } },
    driver: { select: { name: true } },
  };
  const [linkedPayments, linkedCollections, linkedTrips] = await Promise.all([
    paymentIds.length
      ? prisma.driverPayment
          .findMany({
            where: { id: { in: paymentIds } },
            select: { id: true, trip: { select: tripSelect } },
          })
          .catch(() => [])
      : [],
    collectionIds.length
      ? prisma.collection
          .findMany({
            where: { id: { in: collectionIds } },
            select: { id: true, trip: { select: tripSelect } },
          })
          .catch(() => [])
      : [],
    advanceTripIds.length
      ? prisma.trip
          .findMany({
            where: { id: { in: advanceTripIds } },
            select: { id: true, ...tripSelect },
          })
          .catch(() => [])
      : [],
  ]);

  type TripParties = {
    startPoint: string;
    endPoint: string;
    contractor: { name: string };
    driver: { name: string } | null;
  };
  const tripByPaymentId = new Map<string, TripParties>(
    linkedPayments.map((p) => [p.id, p.trip])
  );
  const tripByCollectionId = new Map<string, TripParties>(
    linkedCollections.map((c) => [c.id, c.trip])
  );
  const tripById = new Map<string, TripParties>(
    linkedTrips.map((t) => [t.id, t])
  );

  /** الرحلة المرتبطة بحركة المحصّل — عبر علامة الربط أو حقل tripId */
  const collectorTrip = (a: { note: string | null; tripId: string | null }) => {
    const dp = a.note?.match(/\[c:dp:([^\]]+)\]/)?.[1];
    if (dp && tripByPaymentId.has(dp)) return tripByPaymentId.get(dp);
    const col = a.note?.match(/\[c:col:([^\]]+)\]/)?.[1];
    if (col && tripByCollectionId.has(col)) return tripByCollectionId.get(col);
    return a.tripId ? tripById.get(a.tripId) : undefined;
  };

  // السداد المجمّع القديم (من صفحة السواق) اتسجّل بدون رابط ولا اسم محفوظ.
  // نستنتج السواق من سدادات نفس الوسيلة ونفس اليوم، وبشرط قاطع فقط: سواق
  // واحد بالظبط مجموع سداداته يساوي قيمة الحركة. أي لبس → منعرضش اسم.
  const unlinkedPayoutKeys = collectorAdvances.filter(
    (a) =>
      a.direction === "IN" &&
      !a.sourceName &&
      !collectorTrip(a) &&
      !a.note?.includes("[expense:")
  );
  const sameDayPayments = unlinkedPayoutKeys.length
    ? await prisma.driverPayment
        .findMany({
          where: {
            OR: unlinkedPayoutKeys.map((a) => ({
              method: a.method,
              date: a.date,
            })),
          },
          select: { method: true, date: true, amount: true, driverId: true },
        })
        .catch(() => [])
    : [];

  /** مجموع سدادات كل سواق في (وسيلة + يوم) — لمطابقتها بقيمة حركة المحصّل */
  const payoutTotals = new Map<string, Map<string, number>>();
  for (const p of sameDayPayments) {
    const slot = `${p.method}|${+p.date}`;
    const byDriver = payoutTotals.get(slot) ?? new Map<string, number>();
    byDriver.set(p.driverId, (byDriver.get(p.driverId) ?? 0) + p.amount);
    payoutTotals.set(slot, byDriver);
  }
  const payoutDriverNames = sameDayPayments.length
    ? await prisma.driver
        .findMany({
          where: { id: { in: [...new Set(sameDayPayments.map((p) => p.driverId))] } },
          select: { id: true, name: true },
        })
        .catch(() => [])
    : [];
  const driverNameById = new Map(payoutDriverNames.map((x) => [x.id, x.name]));

  const inferredPayoutDriver = (a: {
    method: string;
    date: Date;
    amount: number;
  }) => {
    const byDriver = payoutTotals.get(`${a.method}|${+a.date}`);
    if (!byDriver) return null;
    const matches = [...byDriver].filter(([, total]) => total === a.amount);
    return matches.length === 1
      ? (driverNameById.get(matches[0][0]) ?? null)
      : null;
  };

  /** الطرف المقابل: المقاول اللي دفع (OUT) أو السواق اللي استلم (IN) */
  const collectorCounterparty = (a: {
    direction: string;
    method: string;
    amount: number;
    date: Date;
    note: string | null;
    tripId: string | null;
    sourceName: string | null;
  }) => {
    if (a.sourceName) return a.sourceName;
    const t = collectorTrip(a);
    if (t) {
      return a.direction === "OUT" ? t.contractor.name : (t.driver?.name ?? null);
    }
    return a.direction === "IN" ? inferredPayoutDriver(a) : null;
  };

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

  // إجماليات الأسبوع المختار — لصناديق الملخص فقط
  const dueWeek = trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const paidWeek = weekPayments.reduce((a, p) => a + p.amount, 0);
  const remainingWeek = Math.max(dueWeek - paidWeek, 0);

  // رصيد السلف: OUT − IN (موجب = عليه لنا، سالب = لنا عليه)
  const advOut = advances
    .filter((a) => a.direction === "OUT")
    .reduce((s, a) => s + a.amount, 0);
  const advIn = advances
    .filter((a) => a.direction === "IN")
    .reduce((s, a) => s + a.amount, 0);
  const advanceBalance = advOut - advIn;
  // السلف الخارجية بالباقي منها: له = amount − المسلَّم، عليه = amount − المحصَّل
  const externalFor = externalAdvances
    .filter((a) => a.lenderType === "DRIVER" && a.lenderId === id)
    .reduce((s, a) => s + owedToLender(a), 0);
  const externalOn = externalAdvances
    .filter((a) => a.borrowerType === "DRIVER" && a.borrowerId === id)
    .reduce((s, a) => s + owedByBorrower(a), 0);
  const officeFor = Math.max(-advanceBalance, 0);
  const officeOn = Math.max(advanceBalance, 0);
  const totalForDriver = remaining + officeFor + externalFor;
  const totalOnDriver = officeOn + externalOn;

  // الحساب الشامل يحترم فلتر الأسبوع: عند اختيار أسبوع يعرض صافي حركة الأسبوع فقط
  const inBounds = (dt: Date) => !bounds || (dt >= bounds[0] && dt < bounds[1]);
  const mAdvBal =
    advances
      .filter((a) => a.direction === "OUT" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0) -
    advances
      .filter((a) => a.direction === "IN" && inBounds(a.date))
      .reduce((s, a) => s + a.amount, 0);
  const mExternalFor = externalAdvances
    .filter((a) => a.lenderType === "DRIVER" && a.lenderId === id && inBounds(a.date))
    .reduce((s, a) => s + owedToLender(a), 0);
  const mExternalOn = externalAdvances
    .filter((a) => a.borrowerType === "DRIVER" && a.borrowerId === id && inBounds(a.date))
    .reduce((s, a) => s + owedByBorrower(a), 0);
  const sOfficeFor = bounds ? Math.max(-mAdvBal, 0) : officeFor;
  const sOfficeOn = bounds ? Math.max(mAdvBal, 0) : officeOn;
  const sExternalFor = bounds ? mExternalFor : externalFor;
  const sExternalOn = bounds ? mExternalOn : externalOn;
  const sRemaining = bounds ? remainingWeek : remaining;
  const summaryFor = sRemaining + sOfficeFor + sExternalFor;
  const summaryOn = sOfficeOn + sExternalOn;

  const periodLabel = bounds ? `أسبوع ${weekLabel(selectedWeek)}` : "كل الفترات";
  const statementRows: StatementRow[] = [
    ...trips.map((t) => ({
      id: `trip-${t.id}`,
      date: t.date,
      description: `رحلة ${t.startPoint} ← ${t.endPoint}`,
      details: `المقاول: ${t.contractor.name} • ${TRIP_STATUS[tripStatus(t.status)]}`,
      forParty: effectiveAmounts(t).driver,
      action: { kind: "trip" as const, id: t.id },
    })),
    ...weekPayments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.date,
      description: `سداد للسواق - ${methodLabel(p.method)}`,
      details: p.trip
        ? `${p.trip.startPoint} ← ${p.trip.endPoint}${p.note ? ` • ${p.note}` : ""}`
        : p.note,
      received: p.amount,
      // السداد المجمّع يتقسّم على الرحلات — كل دفعة تظهر كحركة واحدة
      groupKey: `dp|${p.method}|${+p.date}|${p.note ?? ""}`,
      createdAt: p.createdAt,
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
        details: stripMarkers(a.note),
        forParty: a.amount,
        groupKey: `psettle|${a.method}|${+a.date}|${stripMarkers(a.note) ?? ""}`,
        createdAt: a.createdAt,
        action: {
          kind: "locked" as const,
          reason: "ربح شريك على حساب السواق — يُدار من صفحة الشركاء",
        },
      })),
    ...advances
      .filter((a) => inBounds(a.date) && !driverIdFromAccountMethod(a.method))
      .map((a) => {
        const isCollector = collectorNameFromMethod(a.method) !== null;
        const other = isCollector ? collectorCounterparty(a) : null;
        // داخل الدفعة المجمّعة الملاحظة واحدة ومكرّرة — الرحلة أنفع للتمييز
        const trip = isCollector ? collectorTrip(a) : undefined;
        // في ملف المحصّل: OUT = قبض فلوس من مقاول، IN = سلّم فلوس لسواق.
        // استثناء: المصروف اللي اتدفع من فلوس المحصّل — مالوش طرف مقابل.
        // اسم المحصّل نفسه مش معلومة هنا، فبنوصف العملية حتى لو الطرف مجهول.
        const expenseName = a.note?.includes("[expense:")
          ? a.note.split("[expense:")[0].split(":").slice(1).join(":").trim()
          : null;
        const collectorLabel = a.note?.includes("[withdrawal:")
          ? "سلّم ربح لشريك من فلوسه"
          : expenseName
          ? `مصروف — ${expenseName}`
          : a.note?.includes("[expense:")
            ? "مصروف من فلوس المحصّل"
            : a.direction === "OUT"
              ? other
                ? `حصّل من المقاول ${other}`
                : "حصّل فلوس من مقاول"
              : other
                ? `سلّم مستحقات للسواق ${other}`
                : "سلّم مستحقات لسواق";
        return {
          id: `advance-${a.id}`,
          date: a.date,
          description: isCollector
            ? collectorLabel
            : isSystemAdvanceMethod(a.method)
              ? methodLabel(a.method)
              : a.direction === "OUT"
                ? `استلم من المكتب - ${methodLabel(a.method)}`
                : `دفع للمكتب - ${methodLabel(a.method)}`,
          details: trip
            ? `رحلة ${trip.startPoint} ← ${trip.endPoint}`
            : stripMarkers(a.note),
          onParty: a.direction === "OUT" ? a.amount : undefined,
          paid: a.direction === "IN" ? a.amount : undefined,
          received: a.direction === "OUT" ? a.amount : undefined,
          // تحصيل/سداد المحصّل يتقسّم على الرحلات — الدفعة الواحدة حركة واحدة.
          // الوصف جزء من المفتاح حتى لا تندمج حركتان لطرفين مختلفين (أو مصروف
          // مع سداد) في صف واحد بعنوان واحد. الحركات اليدوية بلا مفتاح تجميع.
          groupKey: isSystemAdvanceMethod(a.method)
            ? `adv|${a.direction}|${a.method}|${isCollector ? collectorLabel : ""}|${+a.date}`
            : null,
          createdAt: a.createdAt,
          action: advanceRowAction(a),
        };
      }),
    ...externalAdvances.flatMap((a) => {
      const isBorrower = a.borrowerType === "DRIVER" && a.borrowerId === id;
      const rows: StatementRow[] = [];
      if (inBounds(a.date)) {
        rows.push({
          id: `external-${a.id}`,
          date: a.date,
          description: isBorrower
            ? `استلم سلفة خارجية من ${a.lenderName}`
            : `دفع سلفة خارجية إلى ${a.borrowerName}`,
          details: a.note ?? undefined,
          forParty: isBorrower ? undefined : a.amount,
          onParty: isBorrower ? a.amount : undefined,
          paid: isBorrower ? undefined : a.amount,
          received: isBorrower ? a.amount : undefined,
          action: { kind: "external" as const, id: a.id },
        });
      }
      // ساق التسوية: سدّد للمكتب (كمستلِف) أو استلم من المكتب (كمُقرِض) — تصفّر السطر
      const settled = isBorrower ? a.collectedAmount ?? 0 : a.paidAmount ?? 0;
      if (settled > 0 && inBounds(a.updatedAt)) {
        rows.push({
          id: `external-leg-${a.id}`,
          date: a.updatedAt,
          description: isBorrower
            ? "سدّد سلفة خارجية للمكتب"
            : "استلم سلفة خارجية من المكتب",
          details: isBorrower ? `لصالح ${a.lenderName}` : `من ${a.borrowerName}`,
          paid: isBorrower ? settled : undefined,
          received: isBorrower ? undefined : settled,
        });
      }
      return rows;
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

        {/* فلتر الأسبوع (السبت → الجمعة) */}
        <WeekFilter weeks={weeks} selected={selectedWeek} />

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="إجمالي المستحق" value={dueWeek} />
          <SummaryBox label="المدفوع" value={paidWeek} tone="success" />
          <SummaryBox label="المتبقي" value={remainingWeek} tone="warning" />
        </div>

        <AccountTotalSummary
          title={
            bounds ? `الحساب الشامل — أسبوع ${weekLabel(selectedWeek)}` : "الحساب الشامل"
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
            externalCredit={externalFor}
            externalDebt={externalOn}
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
