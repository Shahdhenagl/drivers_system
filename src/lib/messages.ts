import { formatShortDate } from "@/lib/format";
import { displayPhone } from "@/lib/phone";

type TripForMsg = {
  date: Date;
  time?: string | null;
  startPoint: string;
  endPoint: string;
  notes?: string | null;
  contractor: { name: string; phone: string };
  driver?: { name: string; phone: string } | null;
};

/** رسالة للمقاول — بدون أي معلومات مالية */
export function contractorMessage(t: TripForMsg): string {
  const lines = [
    "🚛 تفاصيل رحلتك",
    `📅 التاريخ: ${formatShortDate(t.date)}`,
    t.time ? `🕐 الوقت: ${t.time}` : "",
    `📍 من: ${t.startPoint}`,
    `🏁 إلى: ${t.endPoint}`,
  ];
  if (t.driver) {
    lines.push(`👤 السائق: ${t.driver.name}`);
    lines.push(`📞 رقم السائق: ${displayPhone(t.driver.phone)}`);
  }
  return lines.filter(Boolean).join("\n");
}

/** رسالة للسواق — لا يظهر سعر المقاول إطلاقًا */
export function driverMessage(t: TripForMsg): string {
  const lines = [
    "🚛 لديك رحلة جديدة",
    `📅 التاريخ: ${formatShortDate(t.date)}`,
    t.time ? `🕐 الوقت: ${t.time}` : "",
    `📍 من: ${t.startPoint}`,
    `🏁 إلى: ${t.endPoint}`,
    `👤 العميل: ${t.contractor.name}`,
    `📞 رقم العميل: ${displayPhone(t.contractor.phone)}`,
    t.notes ? `📝 ملاحظات: ${t.notes}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** تذكير للسواق */
export function driverReminder(t: TripForMsg): string {
  return [
    "🔔 تذكير برحلة",
    `📅 ${formatShortDate(t.date)}${t.time ? " - " + t.time : ""}`,
    `📍 من: ${t.startPoint} إلى: ${t.endPoint}`,
    `👤 العميل: ${t.contractor.name}`,
  ].join("\n");
}

/** تذكير بالتحصيل للمقاول */
export function collectionReminder(
  t: TripForMsg,
  remainingEgp: string
): string {
  return [
    `السلام عليكم أ. ${t.contractor.name}`,
    `نذكّر حضرتك بوجود مبلغ متبقٍّ بقيمة ${remainingEgp}`,
    `عن رحلة ${formatShortDate(t.date)} من ${t.startPoint} إلى ${t.endPoint}.`,
    "برجاء التكرم بسداده. شكرًا لتعاونكم 🌹",
  ].join("\n");
}
