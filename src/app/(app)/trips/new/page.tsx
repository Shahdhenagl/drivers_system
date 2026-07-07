import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { NewTripTabs } from "./new-trip-tabs";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ contractor?: string; driver?: string }>;
}) {
  const { contractor: initialContractorId, driver: initialDriverId } =
    await searchParams;
  const [contractors, drivers, recentTrips] = await Promise.all([
    prisma.contractor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    // ذاكرة الأسعار: أحدث الرحلات لبناء قائمة مسارات فريدة بآخر سعر لكل مسار
    prisma.trip.findMany({
      orderBy: { createdAt: "desc" },
      take: 600,
      select: {
        startPoint: true,
        endPoint: true,
        vehicleType: true,
        contractorPrice: true,
        driverDue: true,
      },
    }),
  ]);

  // مسارات فريدة (start|end) بأحدث سعر — الأحدث أولًا
  const seen = new Set<string>();
  const routes: {
    startPoint: string;
    endPoint: string;
    vehicleType: string | null;
    contractorPrice: number;
    driverDue: number;
  }[] = [];
  for (const t of recentTrips) {
    const key = `${t.startPoint.trim().toLowerCase()}|${t.endPoint.trim().toLowerCase()}|${(t.vehicleType ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({
      startPoint: t.startPoint,
      endPoint: t.endPoint,
      vehicleType: t.vehicleType,
      contractorPrice: t.contractorPrice,
      driverDue: t.driverDue,
    });
    if (routes.length >= 250) break;
  }

  return (
    <>
      <AppHeader title="طلب جديد" />
      <div className="space-y-4 py-3">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
        <NewTripTabs
          contractors={contractors}
          drivers={drivers}
          routes={routes}
          initialContractorId={initialContractorId}
          initialDriverId={initialDriverId}
        />
      </div>
    </>
  );
}
