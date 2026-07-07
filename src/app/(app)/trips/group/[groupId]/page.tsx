import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tripFinancials } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import {
  TRIP_STATUS,
  TRIP_STATUS_COLOR,
  COLLECTION_STATUS,
  COLLECTION_STATUS_COLOR,
  type TripStatus,
  type CollectionStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  MapPin,
  Flag,
  User,
  Truck,
  ChevronLeft,
  CalendarRange,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TripGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const trips = await prisma.trip.findMany({
    where: { groupId },
    orderBy: { date: "asc" },
    include: {
      contractor: { select: { name: true, id: true } },
      driver: { select: { name: true } },
      collections: true,
      driverPayments: true,
    },
  });
  if (trips.length === 0) notFound();

  const fins = trips.map((t) => ({ trip: t, fin: tripFinancials(t) }));
  const totalContractor = fins.reduce((a, x) => a + x.fin.effContractor, 0);
  const totalDriver = fins.reduce((a, x) => a + x.fin.effDriver, 0);
  const totalProfit = totalContractor - totalDriver;
  const totalCollected = fins.reduce((a, x) => a + x.fin.collected, 0);
  const totalRemaining = Math.max(totalContractor - totalCollected, 0);
  const totalPaidDrivers = fins.reduce((a, x) => a + x.fin.paidToDriver, 0);

  const route = trips[0];

  return (
    <>
      <AppHeader title="حجز متعدد الأيام" />
      <div className="space-y-4 py-3">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>

        {/* الترويسة */}
        <Card className="space-y-3 p-4">
          <Badge className="bg-primary/15 text-primary">
            <CalendarRange className="ml-1 h-3 w-3" /> رحلة {trips.length} أيام
          </Badge>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-success" /> {route.startPoint}
            </div>
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" /> {route.endPoint}
            </div>
            {route.vehicleType && (
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" /> {route.vehicleType}
              </div>
            )}
            <Link
              href={`/contractors/${route.contractor.id}`}
              className="flex items-center gap-2 text-primary"
            >
              <User className="h-4 w-4" /> {route.contractor.name}
            </Link>
          </div>
        </Card>

        {/* الإجماليات */}
        <div className="grid grid-cols-2 gap-3">
          <Box label="إجمالي على المقاول" value={totalContractor} />
          <Box label="محصّل / متبقي" value={totalCollected} sub={totalRemaining} />
          <Box label="مستحقات السواقين" value={totalDriver} tone="warning" />
          <Box label="مدفوع للسواقين" value={totalPaidDrivers} tone="success" />
        </div>
        <Card className="flex items-center justify-between border-2 border-primary/50 bg-primary/5 p-4">
          <span className="text-sm font-bold">إجمالي ربحك من الحجز</span>
          <span className="text-xl font-extrabold tabular-nums text-primary">
            {formatMoney(totalProfit)}
          </span>
        </Card>

        {/* الأيام */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            الأيام ({trips.length})
          </h2>
          <div className="space-y-2">
            {fins.map(({ trip: t, fin }, i) => {
              const st = t.status as TripStatus;
              const cs = t.collectionStatus as CollectionStatus;
              return (
                <Link key={t.id} href={`/trips/${t.id}`}>
                  <Card className="space-y-2 p-3 active:scale-[0.99] transition-transform">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">
                        اليوم {i + 1} • {formatShortDate(t.date)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn("text-[10px]", TRIP_STATUS_COLOR[st])}>
                          {TRIP_STATUS[st]}
                        </Badge>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Truck className="h-3 w-3" />
                      {t.driver?.name ?? "بدون سواق"}
                      <Badge
                        className={cn(
                          "mr-auto text-[10px]",
                          COLLECTION_STATUS_COLOR[cs]
                        )}
                      >
                        {COLLECTION_STATUS[cs]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
                      <MiniBox label="المقاول" value={fin.effContractor} />
                      <MiniBox
                        label="السواق"
                        value={fin.effDriver}
                        tone="text-warning"
                      />
                      <MiniBox
                        label="الربح"
                        value={fin.profit}
                        tone="text-primary"
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function Box({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  sub?: number;
  tone?: "default" | "warning" | "success";
}) {
  const color = {
    default: "text-foreground",
    warning: "text-warning",
    success: "text-success",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>
        {formatMoney(value, false)}
        {sub !== undefined && (
          <span className="text-sm text-destructive">
            {" / "}
            {formatMoney(sub, false)}
          </span>
        )}
      </div>
    </Card>
  );
}

function MiniBox({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${tone}`}>
        {formatMoney(value, false)}
      </div>
    </div>
  );
}
