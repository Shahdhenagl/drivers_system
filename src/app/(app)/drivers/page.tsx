import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { SearchBar } from "@/components/search-bar";
import { DriverForm } from "./driver-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import { effectiveAmounts } from "@/lib/finance";
import { Plus, Phone, Truck, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [drivers, allIds] = await Promise.all([
    prisma.driver.findMany({
      // المشتركون (linkId != null) لهم قسم مستقل «المشتركين»
      where: {
        linkId: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { altPhone: { contains: q } },
                { phone3: { contains: q } },
                { vehicleType: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        trips: {
          select: {
            status: true,
            contractorPrice: true,
            driverDue: true,
            driverTip: true,
            customerDiscount: true,
            contractorPenalty: true,
            driverPenalty: true,
            driverPayments: { select: { amount: true } },
          },
        },
      },
    }),
    // رقم تسلسلي ثابت حسب ترتيب الإضافة (أول سواق = 1)
    prisma.driver.findMany({
      where: { linkId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const seqMap = new Map(allIds.map((d, i) => [d.id, i + 1]));

  return (
    <>
      <AppHeader title="السواقين" />
      <div className="space-y-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchBar placeholder="ابحث بالاسم أو الرقم أو نوع السيارة..." />
          </div>
          <DriverForm
            trigger={
              <Button size="icon" aria-label="إضافة سواق">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
        </div>

        {drivers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Truck className="h-12 w-12 opacity-40" />
            <p>لا يوجد سواقون بعد</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {drivers.map((d) => {
              const remaining = d.trips.reduce((a, t) => {
                const eff = effectiveAmounts(t);
                const paid = t.driverPayments.reduce((s, x) => s + x.amount, 0);
                return a + Math.max(eff.driver - paid, 0);
              }, 0);
              return (
                <Link key={d.id} href={`/drivers/${d.id}`}>
                  <Card className="flex items-center gap-3 p-3.5 active:scale-[0.99] transition-transform">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning font-bold tabular-nums">
                      {seqMap.get(d.id)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{d.name}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {displayPhone(d.phone)}
                        </span>
                        <span className="truncate">{d.vehicleType}</span>
                      </div>
                    </div>
                    {remaining > 0 && (
                      <div className="text-left">
                        <div className="text-[10px] text-muted-foreground">
                          مستحق له
                        </div>
                        <div className="text-sm font-bold text-warning tabular-nums">
                          {formatMoney(remaining, false)}
                        </div>
                      </div>
                    )}
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
