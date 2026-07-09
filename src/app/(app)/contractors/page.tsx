import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { SearchBar } from "@/components/search-bar";
import { ContractorForm } from "./contractor-form";
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
import { Plus, Phone, Building2, ChevronLeft, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [contractors, allIds] = await Promise.all([
    prisma.contractor.findMany({
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
                { company: { contains: q } },
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
            collections: { select: { amount: true } },
          },
        },
      },
    }),
    // رقم تسلسلي ثابت حسب ترتيب الإضافة (أول مقاول = 1)
    prisma.contractor.findMany({
      where: { linkId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const seqMap = new Map(allIds.map((c, i) => [c.id, i + 1]));

  // أرصدة السلف (المكتب + الخارجية) لحساب الصافي له/عليه لكل مقاول
  const [advBalById, extRem] = await Promise.all([
    advanceBalancesByParty("CONTRACTOR"),
    externalRemainingByParty("CONTRACTOR"),
  ]);

  return (
    <>
      <AppHeader title="المقاولين" />
      <div className="space-y-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchBar placeholder="ابحث بالاسم أو الرقم أو الشركة..." />
          </div>
          <ContractorForm
            trigger={
              <Button size="icon" aria-label="إضافة مقاول">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
        </div>

        {contractors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2.5">
            {contractors.map((c) => {
              const due = c.trips.reduce((a, t) => {
                const eff = effectiveAmounts(t);
                const collected = t.collections.reduce((s, x) => s + x.amount, 0);
                return a + Math.max(eff.contractor - collected, 0);
              }, 0);
              // الصافي: عليه (آجل + سلف مكتب عليه + سلف خارجية عليه) − له (سلف مكتب له + خارجية له)
              const advBal = advBalById.get(c.id) ?? 0;
              const officeOn = Math.max(advBal, 0);
              const officeFor = Math.max(-advBal, 0);
              const extOn = extRem.onMap.get(c.id) ?? 0;
              const extFor = extRem.forMap.get(c.id) ?? 0;
              const net = due + officeOn + extOn - officeFor - extFor;
              return (
                <Link key={c.id} href={`/contractors/${c.id}`}>
                  <Card className="flex items-center gap-3 p-3.5 active:scale-[0.99] transition-transform">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-bold tabular-nums">
                      {seqMap.get(c.id)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {displayPhone(c.phone)}
                        </span>
                        {c.company && (
                          <span className="flex items-center gap-1 truncate">
                            <Building2 className="h-3 w-3" />
                            {c.company}
                          </span>
                        )}
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
      <Users className="h-12 w-12 opacity-40" />
      <p>لا يوجد مقاولون بعد</p>
    </div>
  );
}
