import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { SearchBar } from "@/components/search-bar";
import { SharedForm } from "./shared-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import {
  effectiveAmounts,
  advanceBalancesByParty,
  externalRemainingByParty,
} from "@/lib/finance";
import { Plus, Phone, ChevronLeft, UsersRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SharedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const nameFilter = q
    ? {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { altPhone: { contains: q } },
          { phone3: { contains: q } },
        ],
      }
    : {};

  const [contractors, drivers] = await Promise.all([
    prisma.contractor.findMany({
      where: { linkId: { not: null }, ...nameFilter },
      orderBy: { createdAt: "desc" },
      include: {
        trips: { select: { status: true, contractorPrice: true, driverDue: true, driverTip: true, customerDiscount: true, contractorSurcharge: true, collections: { select: { amount: true } } } },
      },
    }),
    prisma.driver.findMany({
      where: { linkId: { not: null } },
      select: {
        id: true,
        linkId: true,
        trips: { select: { status: true, driverDue: true, driverTip: true, contractorPrice: true, customerDiscount: true, contractorSurcharge: true, driverPayments: { select: { amount: true } } } },
      },
    }),
  ]);

  // أرصدة السلف (مكتب + خارجية) للجانبين لحساب الصافي الموحّد
  const [cAdv, cExt, dAdv, dExt] = await Promise.all([
    advanceBalancesByParty("CONTRACTOR"),
    externalRemainingByParty("CONTRACTOR"),
    advanceBalancesByParty("DRIVER"),
    externalRemainingByParty("DRIVER"),
  ]);

  // بيانات السواق لكل linkId (المتبقي ومعرّفه)
  const driverByLink = new Map<string, { id: string; remaining: number }>();
  for (const d of drivers) {
    if (!d.linkId) continue;
    const rem = d.trips.reduce((a, t) => {
      const paid = t.driverPayments.reduce((s, x) => s + x.amount, 0);
      return a + Math.max(effectiveAmounts(t).driver - paid, 0);
    }, 0);
    driverByLink.set(d.linkId, { id: d.id, remaining: rem });
  }

  return (
    <>
      <AppHeader title="المشتركين" />
      <div className="space-y-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchBar placeholder="ابحث بالاسم أو الرقم..." />
          </div>
          <SharedForm
            trigger={
              <Button size="icon" aria-label="إضافة مشترك">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
        </div>

        {contractors.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <UsersRound className="h-12 w-12 opacity-40" />
            <p>لا يوجد مشتركون بعد</p>
            <p className="text-xs">المشترك هو عميل يعمل سواقًا ومقاولًا معًا</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {contractors.map((c) => {
              const deferred = c.trips.reduce((a, t) => {
                const collected = t.collections.reduce((s, x) => s + x.amount, 0);
                return a + Math.max(effectiveAmounts(t).contractor - collected, 0);
              }, 0);
              const dInfo = c.linkId ? driverByLink.get(c.linkId) : undefined;
              const driverRem = dInfo?.remaining ?? 0;
              // الصافي الموحّد للجانبين: عليه − له
              const cBal = cAdv.get(c.id) ?? 0;
              const dBal = dInfo ? dAdv.get(dInfo.id) ?? 0 : 0;
              const onParty =
                deferred +
                Math.max(cBal, 0) +
                (cExt.onMap.get(c.id) ?? 0) +
                Math.max(dBal, 0) +
                (dInfo ? dExt.onMap.get(dInfo.id) ?? 0 : 0);
              const forParty =
                driverRem +
                Math.max(-cBal, 0) +
                (cExt.forMap.get(c.id) ?? 0) +
                Math.max(-dBal, 0) +
                (dInfo ? dExt.forMap.get(dInfo.id) ?? 0 : 0);
              const net = onParty - forParty; // موجب = عليه
              return (
                <Link key={c.id} href={`/shared/${c.linkId}`}>
                  <Card className="flex items-center gap-3 p-3.5 active:scale-[0.99] transition-transform">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
                      <UsersRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{c.name}</span>
                        <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                          مشترك
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {displayPhone(c.phone)}
                      </div>
                    </div>
                    {net !== 0 && (
                      <div className="text-left">
                        <div className="text-[10px] text-muted-foreground">
                          {net > 0 ? "عليه" : "له"}
                        </div>
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            net > 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {formatMoney(Math.abs(net), false)}
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
