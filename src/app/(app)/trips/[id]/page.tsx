import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TripActions } from "./trip-actions";
import { EditTripForm } from "./edit-trip";
import { DeleteTripButton } from "./delete-trip-button";
import { MovementActions, type MovementActionData } from "./movement-actions";
import { tripFinancials } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import {
  contractorMessage,
  driverMessage,
  driverReminder,
  collectionReminder,
} from "@/lib/messages";
import {
  TRIP_STATUS,
  TRIP_STATUS_COLOR,
  COLLECTION_STATUS,
  COLLECTION_STATUS_COLOR,
  methodLabel,
  VIA_DRIVER,
  type TripStatus,
  type CollectionStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  MapPin,
  Flag,
  Clock,
  User,
  Truck,
  Send,
  Bell,
  Pencil,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TripDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      contractor: true,
      driver: true,
      collections: { orderBy: { date: "desc" } },
      driverPayments: { orderBy: { date: "desc" } },
    },
  });
  if (!trip) notFound();

  const fin = tripFinancials(trip);
  const st = trip.status as TripStatus;
  const cs = trip.collectionStatus as CollectionStatus;

  const msgData = {
    date: trip.date,
    time: trip.time,
    startPoint: trip.startPoint,
    endPoint: trip.endPoint,
    description: trip.description,
    notes: trip.notes,
    contractor: { name: trip.contractor.name, phone: trip.contractor.phone },
    driver: trip.driver
      ? { name: trip.driver.name, phone: trip.driver.phone }
      : null,
  };

  const drivers = await prisma.driver.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });

  // التحويلات والسلف المربوطة بالرحلة (مرنة لو الجدول/العمود غير موجود قبل الترحيل)
  const [transfers, tripAdvances] = await Promise.all([
    prisma.tripTransfer
      .findMany({ where: { tripId: id }, orderBy: { date: "desc" } })
      .catch(() => [] as { id: string; type: string; amount: number; method: string | null; date: Date; note: string | null }[]),
    prisma.advance
      .findMany({ where: { tripId: id }, orderBy: { date: "desc" } })
      .catch(() => [] as { id: string; direction: string; amount: number; method: string; date: Date; note: string | null }[]),
  ]);

  // سجل الحركات المالية الموحّد للرحلة
  type Movement = {
    id: string;
    kind: MovementActionData["kind"];
    date: Date;
    label: string;
    amount: number;
    tone: "in" | "out" | "neutral";
    method?: string | null;
    note?: string | null;
  };
  const movements: Movement[] = [];
  for (const c of trip.collections) {
    movements.push({
      id: c.id,
      kind: "collection",
      date: c.date,
      label: c.method === VIA_DRIVER ? "تحصيل عن طريق السواق" : "تحصيل من المقاول",
      amount: c.amount,
      tone: "in",
      method: c.method,
      note: c.note,
    });
  }
  for (const p of trip.driverPayments) {
    if (p.method === VIA_DRIVER) continue; // مشمول ضمن «تحصيل عن طريق السواق»
    movements.push({
      id: p.id,
      kind: "driverPayment",
      date: p.date,
      label: "سداد للسواق",
      amount: p.amount,
      tone: "out",
      method: p.method,
      note: p.note,
    });
  }
  for (const t of transfers) {
    movements.push({
      id: t.id,
      kind: "transfer",
      date: t.date,
      label:
        t.type === "CONTRACTOR_FROM_DRIVER"
          ? "المقاول استلف من السواق"
          : "المقاول استلف من المكتب",
      amount: t.amount,
      tone: "neutral",
      method: t.method,
      note: t.note,
    });
  }
  for (const a of tripAdvances) {
    movements.push({
      id: a.id,
      kind: "advance",
      date: a.date,
      label: a.direction === "OUT" ? "المقاول استلف من المكتب" : "سداد سلفة المقاول",
      amount: a.amount,
      tone: a.direction === "OUT" ? "out" : "in",
      method: a.method,
      note: a.note,
    });
  }
  movements.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

  return (
    <>
      <AppHeader title="تفاصيل الطلب" />
      <div className="space-y-4 py-3">
        <div className="flex items-center justify-between">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <div className="flex items-center gap-2">
          <EditTripForm
            trip={{
              id: trip.id,
              date: trip.date,
              time: trip.time,
              startPoint: trip.startPoint,
              endPoint: trip.endPoint,
              vehicleType: trip.vehicleType,
              description: trip.description,
              distance: trip.distance,
              contractorPrice: trip.contractorPrice,
              driverDue: trip.driverDue,
              driverTip: trip.driverTip,
              customerDiscount: trip.customerDiscount,
              contractorSurcharge: trip.contractorSurcharge,
              driverId: trip.driverId,
            }}
            drivers={drivers}
            trigger={
              <Button variant="ghost" size="sm">
                <Pencil className="h-4 w-4" /> تعديل
              </Button>
            }
          />
            <DeleteTripButton id={trip.id} canDelete={fin.collected === 0} />
          </div>
        </div>

        {/* الحالة + المسار */}
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={cn(TRIP_STATUS_COLOR[st])}>{TRIP_STATUS[st]}</Badge>
            <Badge className={cn(COLLECTION_STATUS_COLOR[cs])}>
              {COLLECTION_STATUS[cs]}
            </Badge>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {formatShortDate(trip.date)}
              {trip.time ? ` - ${trip.time}` : ""}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-success" />
              {trip.startPoint}
            </div>
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              {trip.endPoint}
            </div>
            {trip.vehicleType && (
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                {trip.vehicleType}
              </div>
            )}
            {trip.distance && (
              <div className="text-xs text-muted-foreground">
                المسافة: {trip.distance} كم
              </div>
            )}
            {trip.description && (
              <p className="rounded-lg bg-muted p-2 text-sm">{trip.description}</p>
            )}
          </div>
        </Card>

        {/* الأطراف */}
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/contractors/${trip.contractor.id}`}>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" /> المقاول
              </div>
              <div className="mt-1 font-semibold">{trip.contractor.name}</div>
              <div className="text-xs text-muted-foreground">
                {displayPhone(trip.contractor.phone)}
              </div>
            </Card>
          </Link>
          {trip.driver ? (
            <Link href={`/drivers/${trip.driver.id}`}>
              <Card className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3" /> السواق
                </div>
                <div className="mt-1 font-semibold">{trip.driver.name}</div>
                <div className="text-xs text-muted-foreground">
                  {displayPhone(trip.driver.phone)}
                </div>
              </Card>
            </Link>
          ) : (
            <Card className="flex items-center justify-center p-3 text-sm text-muted-foreground">
              بدون سواق
            </Card>
          )}
        </div>

        {/* الملخص المالي */}
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {st === "CANCELLED" ? (
              <>
                <Money label="غرامة العميل" value={fin.effContractor} />
                <Money label="نصيب السواق" value={fin.effDriver} tone="warning" />
                <Money label="إيراد الغرامة" value={fin.profit} tone="primary" />
              </>
            ) : (
              <>
                <Money label="سعر المقاول" value={trip.contractorPrice} />
                <Money label="مستحق السواق" value={trip.driverDue} tone="warning" />
                <Money label="الربح" value={fin.profit} tone="primary" />
              </>
            )}
          </div>
          {st !== "CANCELLED" &&
            (trip.driverTip > 0 ||
              trip.customerDiscount > 0 ||
              trip.contractorSurcharge > 0) && (
              <div className="space-y-1 rounded-lg bg-muted/60 p-2 text-xs">
                {trip.driverTip > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">زيادة للسواق</span>
                    <span className="font-semibold text-warning">
                      +{formatMoney(trip.driverTip, false)} — السواق يقبض{" "}
                      {formatMoney(fin.effDriver, false)}
                    </span>
                  </div>
                )}
                {trip.customerDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">خصم للمقاول</span>
                    <span className="font-semibold text-destructive">
                      −{formatMoney(trip.customerDiscount, false)} — المقاول يدفع{" "}
                      {formatMoney(fin.effContractor, false)}
                    </span>
                  </div>
                )}
                {trip.contractorSurcharge > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">زيادة على المقاول</span>
                    <span className="font-semibold text-success">
                      +{formatMoney(trip.contractorSurcharge, false)} — المقاول يدفع{" "}
                      {formatMoney(fin.effContractor, false)}
                    </span>
                  </div>
                )}
              </div>
            )}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
            <div>
              <div className="text-[11px] text-muted-foreground">محصّل / متبقي</div>
              <div className="text-sm font-bold">
                <span className="text-success">{formatMoney(fin.collected, false)}</span>
                {" / "}
                <span className="text-destructive">
                  {formatMoney(fin.remainingCollection, false)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">مدفوع / متبقي للسواق</div>
              <div className="text-sm font-bold">
                <span className="text-success">{formatMoney(fin.paidToDriver, false)}</span>
                {" / "}
                <span className="text-warning">
                  {formatMoney(fin.remainingDriver, false)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* العمليات */}
        <TripActions
          tripId={trip.id}
          status={trip.status}
          hasDriver={!!trip.driverId}
          remainingCollection={fin.remainingCollection}
          remainingDriver={fin.remainingDriver}
          notes={trip.notes}
        />

        {/* واتساب */}
        <Card className="space-y-2 p-4">
          <div className="text-sm font-bold text-muted-foreground">إرسال واتساب</div>
          <div className="grid grid-cols-2 gap-2">
            <WhatsAppButton
              phones={[
                trip.contractor.phone,
                trip.contractor.altPhone,
                trip.contractor.phone3,
              ]}
              message={contractorMessage(msgData)}
              variant="success"
              size="sm"
            >
              <Send className="h-4 w-4" /> للمقاول
            </WhatsAppButton>
            <WhatsAppButton
              phones={
                trip.driver
                  ? [trip.driver.phone, trip.driver.altPhone, trip.driver.phone3]
                  : []
              }
              message={trip.driver ? driverMessage(msgData) : ""}
              variant="success"
              size="sm"
              disabled={!trip.driver}
            >
              <Send className="h-4 w-4" /> للسواق
            </WhatsAppButton>
            {trip.driver && (
              <WhatsAppButton
                phones={[trip.driver.phone, trip.driver.altPhone, trip.driver.phone3]}
                message={driverReminder(msgData)}
                variant="outline"
                size="sm"
              >
                <Bell className="h-4 w-4" /> تذكير السواق
              </WhatsAppButton>
            )}
            {fin.remainingCollection > 0 && (
              <WhatsAppButton
                phones={[
                  trip.contractor.phone,
                  trip.contractor.altPhone,
                  trip.contractor.phone3,
                ]}
                message={collectionReminder(
                  msgData,
                  formatMoney(fin.remainingCollection)
                )}
                variant="outline"
                size="sm"
              >
                <Bell className="h-4 w-4" /> تذكير تحصيل
              </WhatsAppButton>
            )}
          </div>
        </Card>

        {/* سجل الحركات المالية للرحلة */}
        {movements.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">
              سجل الحركات المالية
            </h2>
            <Card className="divide-y divide-border">
              {movements.map((m) => (
                <div
                  key={`${m.kind}-${m.id}`}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div
                      className={
                        m.tone === "in"
                          ? "font-medium text-success"
                          : m.tone === "out"
                            ? "font-medium text-warning"
                            : "font-medium text-primary"
                      }
                    >
                      {m.tone === "in" ? "+" : m.tone === "out" ? "−" : ""}
                      {formatMoney(m.amount, false)} — {m.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(m.date)}
                      {m.method ? ` • ${methodLabel(m.method)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.note && (
                      <div className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-[180px]">
                        {m.note}
                      </div>
                    )}
                    <MovementActions movement={m} />
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </>
  );
}

function Money({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "primary";
}) {
  const color = {
    default: "text-foreground",
    warning: "text-warning",
    primary: "text-primary",
  }[tone];
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>
        {formatMoney(value, false)}
      </div>
    </div>
  );
}
