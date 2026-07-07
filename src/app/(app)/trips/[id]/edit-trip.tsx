"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchSelect } from "@/components/ui/search-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { updateTrip } from "../actions";
import { toEgp } from "@/lib/money";
import { toDateInput } from "@/lib/format";
import { TRIP_VEHICLE_TYPES } from "@/lib/vehicle-types";

type Trip = {
  id: string;
  date: Date;
  time: string | null;
  startPoint: string;
  endPoint: string;
  vehicleType: string | null;
  description: string | null;
  distance: number | null;
  contractorPrice: number;
  driverDue: number;
  driverTip: number;
  customerDiscount: number;
  contractorSurcharge: number;
  driverId: string | null;
};

function weekdayFromDateInput(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(
    new Date(`${value}T12:00:00`)
  );
}

export function EditTripForm({
  trip,
  drivers,
  trigger,
}: {
  trip: Trip;
  drivers: { id: string; name: string; phone: string }[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState(trip.driverId ?? "");
  const [tripDate, setTripDate] = useState(() => toDateInput(trip.date));
  const [vehicleType, setVehicleType] = useState(trip.vehicleType ?? "");
  const router = useRouter();
  const tripDay = weekdayFromDateInput(tripDate);

  async function action(fd: FormData) {
    fd.set("driverId", driverId);
    await updateTrip(trip.id, fd);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل الرحلة</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="day">اليوم</Label>
              <Input id="day" value={tripDay} readOnly className="bg-muted" />
              <input type="hidden" name="time" value={tripDay} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startPoint">البداية</Label>
            <Input id="startPoint" name="startPoint" defaultValue={trip.startPoint} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endPoint">النهاية</Label>
            <Input id="endPoint" name="endPoint" defaultValue={trip.endPoint} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicleType">نوع العربية</Label>
            <Select name="vehicleType" value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger id="vehicleType">
                <SelectValue placeholder="اختار نوع العربية" />
              </SelectTrigger>
              <SelectContent>
                {TRIP_VEHICLE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">الوصف</Label>
            <Textarea id="description" name="description" defaultValue={trip.description ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contractorPrice">سعر المقاول</Label>
              <Input
                id="contractorPrice"
                name="contractorPrice"
                type="number"
                step="0.01"
                defaultValue={toEgp(trip.contractorPrice)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driverDue">مستحق السواق</Label>
              <Input
                id="driverDue"
                name="driverDue"
                type="number"
                step="0.01"
                defaultValue={toEgp(trip.driverDue)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driverTip">زيادة للسواق</Label>
              <Input
                id="driverTip"
                name="driverTip"
                type="number"
                step="0.01"
                defaultValue={toEgp(trip.driverTip)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerDiscount">خصم للمقاول</Label>
              <Input
                id="customerDiscount"
                name="customerDiscount"
                type="number"
                step="0.01"
                defaultValue={toEgp(trip.customerDiscount)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractorSurcharge">زيادة على المقاول</Label>
              <Input
                id="contractorSurcharge"
                name="contractorSurcharge"
                type="number"
                step="0.01"
                defaultValue={toEgp(trip.contractorSurcharge)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="distance">المسافة (كم)</Label>
            <Input
              id="distance"
              name="distance"
              type="number"
              step="0.1"
              defaultValue={trip.distance ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>السواق</Label>
            <SearchSelect
              value={driverId}
              onChange={setDriverId}
              options={drivers}
              placeholder="اختر السواق"
            />
          </div>
          <SubmitButton size="lg" className="w-full">
            حفظ التعديلات
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
