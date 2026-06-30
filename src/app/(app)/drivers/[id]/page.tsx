import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { DriverForm } from "../driver-form";
import { DeleteDriverButton } from "../delete-driver-button";
import { PayDriverForm } from "../pay-driver-form";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { displayPhone, whatsAppLink } from "@/lib/phone";
import { PAYMENT_METHODS, TRIP_STATUS } from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ChevronLeft,
  ArrowRight,
  Truck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriverProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      payments: { orderBy: { date: "desc" } },
    },
  });
  if (!d) notFound();

  const active = d.trips.filter((t) => t.status !== "CANCELLED");
  const totalDue = active.reduce((a, t) => a + t.driverDue, 0);
  const totalPaid = d.payments.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(totalDue - totalPaid, 0);

  return (
    <>
      <AppHeader title="ملف السواق" />
      <div className="space-y-4 py-3">
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
            <Button asChild variant="success" size="sm" className="flex-1">
              <a href={whatsAppLink(d.phone, `مرحبًا ${d.name}`)} target="_blank">
                <MessageCircle className="h-4 w-4" />
                واتساب
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${d.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
            <PrintButton />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="إجمالي المستحق" value={totalDue} />
          <SummaryBox label="المدفوع" value={totalPaid} tone="success" />
          <SummaryBox label="المتبقي" value={remaining} tone="warning" />
        </div>

        <div className="print:hidden">
          <PayDriverForm driverId={d.id} remaining={remaining} />
        </div>

        {/* الرحلات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            الرحلات ({d.trips.length})
          </h2>
          <div className="space-y-2">
            {d.trips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {t.startPoint} ← {t.endPoint}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)} • {t.contractor.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-sm font-bold tabular-nums text-warning">
                        {formatMoney(t.driverDue, false)}
                      </div>
                      <Badge className="bg-muted text-[10px] text-muted-foreground">
                        {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                      </Badge>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
            {d.trips.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد رحلات
              </p>
            )}
          </div>
        </section>

        {/* سجل السداد */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل السداد ({d.payments.length})
          </h2>
          <Card className="divide-y divide-border">
            {d.payments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد عمليات سداد
              </p>
            ) : (
              d.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-success">
                      {formatMoney(p.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} •{" "}
                      {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]}
                    </div>
                  </div>
                  {p.note && (
                    <div className="max-w-[45%] truncate text-xs text-muted-foreground">
                      {p.note}
                    </div>
                  )}
                </div>
              ))
            )}
          </Card>
        </section>
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
