import { formatShortDate } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";
import { COMPANY_NAME, methodLabel } from "@/lib/constants";

const SIGNATURE = `\n\n— ${COMPANY_NAME}`;

type AdminTripMsg = {
  date: Date;
  time?: string | null;
  startPoint: string;
  endPoint: string;
  notes?: string | null;
  contractorPrice: number;
  driverDue: number;
  contractor: { name: string; phone: string };
  driver?: { name: string; phone: string } | null;
};

function tripAdminLines(t: AdminTripMsg): string[] {
  return [
    `📅 ${formatShortDate(t.date)}${t.time ? " - " + t.time : ""}`,
    `📍 من: ${t.startPoint}`,
    `🏁 إلى: ${t.endPoint}`,
    `👤 المقاول: ${t.contractor.name}`,
    `📞 ${displayPhone(t.contractor.phone)}`,
    t.driver ? `🚚 السواق: ${t.driver.name}` : "🚚 السواق: غير محدد",
    t.driver ? `📞 ${displayPhone(t.driver.phone)}` : "",
    `💰 سعر المقاول: ${formatMoney(t.contractorPrice)}`,
    `💵 مستحق السواق: ${formatMoney(t.driverDue)}`,
  ];
}

/** إشعار للأدمن بطلب جديد — يشمل الأرقام والسعر */
export function adminNewTripMessage(t: AdminTripMsg): string {
  return (
    ["🆕 <b>طلب جديد</b>", ...tripAdminLines(t), t.notes ? `📝 ${t.notes}` : ""]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** تذكير للأدمن برحلة بعد ساعتين تقريبًا — يشمل الأرقام والسعر */
export function adminTripReminder(t: AdminTripMsg): string {
  return (
    ["🔔 <b>تذكير: رحلة بعد ساعتين تقريبًا</b>", ...tripAdminLines(t)]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** إشعار للأدمن بمصروف جديد */
export function adminExpenseMessage(e: {
  name: string;
  amount: number;
  category?: string | null;
  method: string;
  date: Date;
}): string {
  return (
    [
      "💸 <b>مصروف جديد</b>",
      `📌 ${e.name}`,
      `💵 ${formatMoney(e.amount)}`,
      e.category ? `🏷️ ${e.category}` : "",
      `💳 ${methodLabel(e.method)}`,
      `📅 ${formatShortDate(e.date)}`,
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

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
  return lines.filter(Boolean).join("\n") + SIGNATURE;
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
  return lines.filter(Boolean).join("\n") + SIGNATURE;
}

/** تذكير للسواق — يحتوي بيانات العميل ورقمه */
export function driverReminder(t: TripForMsg): string {
  return (
    [
      "🔔 تذكير برحلة",
      `📅 ${formatShortDate(t.date)}${t.time ? " - " + t.time : ""}`,
      `📍 من: ${t.startPoint}`,
      `🏁 إلى: ${t.endPoint}`,
      `👤 العميل: ${t.contractor.name}`,
      `📞 رقم العميل: ${displayPhone(t.contractor.phone)}`,
      t.notes ? `📝 ملاحظات: ${t.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

type PeriodReport = {
  name: string;
  periodLabel: string;
  from: Date;
  to: Date;
  tripsCount: number;
  total: number;
  settled: number;
  remainingTotal: number;
};

/** تقرير دوري للمقاول (أسبوعي/شهري) */
export function contractorReport(r: PeriodReport): string {
  return (
    [
      `📊 تقرير ${r.periodLabel} — ${r.name}`,
      `🗓️ من ${formatShortDate(r.from)} إلى ${formatShortDate(r.to)}`,
      `🚛 عدد الرحلات: ${r.tripsCount}`,
      `💰 إجمالي قيمة الرحلات: ${formatMoney(r.total)}`,
      `✅ المحصّل خلال الفترة: ${formatMoney(r.settled)}`,
      `🔴 إجمالي المتبقي عليك: ${formatMoney(r.remainingTotal)}`,
    ].join("\n") + SIGNATURE
  );
}

/** تقرير دوري للسواق (أسبوعي/شهري) */
export function driverReport(r: PeriodReport): string {
  return (
    [
      `📊 تقرير ${r.periodLabel} — ${r.name}`,
      `🗓️ من ${formatShortDate(r.from)} إلى ${formatShortDate(r.to)}`,
      `🚛 عدد الرحلات: ${r.tripsCount}`,
      `💵 إجمالي مستحقاتك: ${formatMoney(r.total)}`,
      `✅ المدفوع لك خلال الفترة: ${formatMoney(r.settled)}`,
      `🟢 إجمالي المتبقي لك: ${formatMoney(r.remainingTotal)}`,
    ].join("\n") + SIGNATURE
  );
}

/** تذكير بالتحصيل للمقاول — يحتوي بيانات السواق ورقمه */
export function collectionReminder(
  t: TripForMsg,
  remainingEgp: string
): string {
  return (
    [
      `السلام عليكم أ. ${t.contractor.name}`,
      `نذكّر حضرتك بوجود مبلغ متبقٍّ بقيمة ${remainingEgp}`,
      `عن رحلة ${formatShortDate(t.date)} من ${t.startPoint} إلى ${t.endPoint}.`,
      t.driver ? `🚚 السائق: ${t.driver.name}` : "",
      t.driver ? `📞 رقم السائق: ${displayPhone(t.driver.phone)}` : "",
      "برجاء التكرم بسداده. شكرًا لتعاونكم 🌹",
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}
