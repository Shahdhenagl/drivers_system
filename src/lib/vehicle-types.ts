export const TRIP_VEHICLE_TYPES = [
  "كبيره",
  "صيني",
  "شفورليه",
  "سوزكي",
  "ربع نقل",
  "ميني باص",
  "ملاكي",
] as const;

/**
 * نوع سيارة السواق المسجَّل، لملء "نوع العربية" تلقائيًا عند اختياره.
 * يُقبل فقط لو من الأنواع المعروفة — غير كده يُترك للاختيار اليدوي.
 */
export function driverVehicleType(driver?: { vehicleType: string }): string {
  const type = driver?.vehicleType?.trim() ?? "";
  return (TRIP_VEHICLE_TYPES as readonly string[]).includes(type) ? type : "";
}

