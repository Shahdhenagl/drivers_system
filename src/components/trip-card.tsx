import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { MapPin, Flag, Clock, User, Truck } from "lucide-react";

export type TripCardData = {
  id: string;
  date: Date;
  time: string | null;
  startPoint: string;
  endPoint: string;
  contractorPrice: number;
  driverDue: number;
  status: string;
  collectionStatus: string;
  contractor: { name: string };
  driver: { name: string } | null;
};

export function TripCard({ trip }: { trip: TripCardData }) {
  const profit = trip.contractorPrice - trip.driverDue;
  const st = trip.status as TripStatus;
  const cs = trip.collectionStatus as CollectionStatus;

  return (
    <Link href={`/trips/${trip.id}`}>
      <Card className="space-y-3 p-4 active:scale-[0.99] transition-transform">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={cn(TRIP_STATUS_COLOR[st])}>{TRIP_STATUS[st]}</Badge>
            <Badge className={cn(COLLECTION_STATUS_COLOR[cs])}>
              {COLLECTION_STATUS[cs]}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatShortDate(trip.date)}
            {trip.time ? ` • ${trip.time}` : ""}
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-success" />
            <span className="truncate">{trip.startPoint}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 shrink-0 text-destructive" />
            <span className="truncate">{trip.endPoint}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {trip.contractor.name}
          </span>
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {trip.driver?.name ?? "بدون سواق"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground">سعر المقاول</div>
            <div className="text-sm font-bold tabular-nums">
              {formatMoney(trip.contractorPrice, false)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">مستحق السواق</div>
            <div className="text-sm font-bold tabular-nums text-warning">
              {formatMoney(trip.driverDue, false)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">الربح</div>
            <div className="text-sm font-bold tabular-nums text-primary">
              {formatMoney(profit, false)}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
