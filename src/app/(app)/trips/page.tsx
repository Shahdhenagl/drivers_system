import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { SearchBar } from "@/components/search-bar";
import { TripCard } from "@/components/trip-card";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, addDays } from "@/lib/format";
import { TRIP_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CHIPS = [
  { key: "", label: "الكل" },
  { key: "NEW", label: TRIP_STATUS.NEW },
  { key: "CONFIRMED", label: TRIP_STATUS.CONFIRMED },
  { key: "IN_PROGRESS", label: TRIP_STATUS.IN_PROGRESS },
  { key: "COMPLETED", label: TRIP_STATUS.COMPLETED },
  { key: "CANCELLED", label: TRIP_STATUS.CANCELLED },
];

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    filter?: string;
    collection?: string;
  }>;
}) {
  const sp = await searchParams;
  const where: Prisma.TripWhereInput = {};

  // الطلبات الملغية لا تظهر في "الكل" — فقط عند اختيار فلتر "ملغية"
  if (sp.status) where.status = sp.status;
  else where.status = { not: "CANCELLED" };
  if (sp.filter === "today") {
    where.date = { gte: startOfDay(), lte: endOfDay() };
  } else if (sp.filter === "tomorrow") {
    where.date = { gte: startOfDay(addDays(new Date(), 1)), lte: endOfDay(addDays(new Date(), 1)) };
  }
  if (sp.q) {
    where.OR = [
      { startPoint: { contains: sp.q } },
      { endPoint: { contains: sp.q } },
      { contractor: { name: { contains: sp.q } } },
      { contractor: { phone: { contains: sp.q } } },
      { driver: { name: { contains: sp.q } } },
      { driver: { phone: { contains: sp.q } } },
    ];
  }

  let trips = await prisma.trip.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      contractor: { select: { name: true } },
      driver: { select: { name: true } },
      collections: { select: { amount: true } },
    },
  });

  // فلتر "مستحق التحصيل"
  if (sp.collection === "due") {
    trips = trips.filter((t) => {
      const collected = t.collections.reduce((a, c) => a + c.amount, 0);
      return t.status !== "CANCELLED" && collected < t.contractorPrice;
    });
  }

  const buildHref = (key: string) => {
    const p = new URLSearchParams();
    if (key) p.set("status", key);
    if (sp.q) p.set("q", sp.q);
    return `/trips?${p.toString()}`;
  };

  return (
    <>
      <AppHeader title="الطلبات" />
      <div className="space-y-4 py-3">
        <SearchBar placeholder="بحث: مقاول، سواق، مكان، رقم..." />

        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {STATUS_CHIPS.map((c) => {
            const active = (sp.status ?? "") === c.key && !sp.filter && !sp.collection;
            return (
              <Link
                key={c.key}
                href={buildHref(c.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>

        {trips.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 opacity-40" />
            <p>لا توجد طلبات</p>
            <Link href="/trips/new" className="font-semibold text-primary">
              + إنشاء طلب جديد
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
