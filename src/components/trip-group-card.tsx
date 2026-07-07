import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { MapPin, Flag, User, CalendarRange } from "lucide-react";

export type GroupTrip = {
  id: string;
  date: Date;
  startPoint: string;
  endPoint: string;
  vehicleType?: string | null;
  contractorPrice: number;
  driverDue: number;
  driverTip?: number | null;
  customerDiscount?: number | null;
  contractorSurcharge?: number | null;
  contractor: { name: string };
  collections: { amount: number }[];
};

export function TripGroupCard({
  groupId,
  trips,
}: {
  groupId: string;
  trips: GroupTrip[];
}) {
  const count = trips.length;
  const totalContractor = trips.reduce(
    (a, t) =>
      a +
      t.contractorPrice -
      (t.customerDiscount ?? 0) +
      (t.contractorSurcharge ?? 0),
    0
  );
  const totalDriver = trips.reduce(
    (a, t) => a + t.driverDue + (t.driverTip ?? 0),
    0
  );
  const profit = totalContractor - totalDriver;
  const collected = trips.reduce(
    (a, t) => a + t.collections.reduce((s, c) => s + c.amount, 0),
    0
  );
  const remaining = Math.max(totalContractor - collected, 0);

  const dates = trips.map((t) => new Date(t.date).getTime());
  const from = new Date(Math.min(...dates));
  const to = new Date(Math.max(...dates));
  const route = trips[0];

  return (
    <Link href={`/trips/group/${groupId}`}>
      <Card className="space-y-3 p-4 active:scale-[0.99] transition-transform">
        <div className="flex items-start justify-between gap-2">
          <Badge className="bg-primary/15 text-primary">
            <CalendarRange className="ml-1 h-3 w-3" /> رحلة {count} أيام
          </Badge>
          <div className="text-xs text-muted-foreground">
            {formatShortDate(from)} — {formatShortDate(to)}
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-success" />
            <span className="truncate">{route.startPoint}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 shrink-0 text-destructive" />
            <span className="truncate">{route.endPoint}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          {route.contractor.name}
          {route.vehicleType && (
            <span className="mr-auto rounded-md bg-muted px-1.5 py-0.5">
              {route.vehicleType}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground">على المقاول</div>
            <div className="text-sm font-bold tabular-nums">
              {formatMoney(totalContractor, false)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">للسواقين</div>
            <div className="text-sm font-bold tabular-nums text-warning">
              {formatMoney(totalDriver, false)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">الربح</div>
            <div className="text-sm font-bold tabular-nums text-primary">
              {formatMoney(profit, false)}
            </div>
          </div>
        </div>

        {remaining > 0 && (
          <div className="text-center text-xs text-destructive">
            متبقٍّ للتحصيل: {formatMoney(remaining)}
          </div>
        )}
      </Card>
    </Link>
  );
}
