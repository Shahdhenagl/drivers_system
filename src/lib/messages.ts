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
  driverTip?: number | null;
  customerDiscount?: number | null;
  contractor: { name: string; phone: string };
  driver?: { name: string; phone: string } | null;
};

function tripAdminLines(t: AdminTripMsg): string[] {
  const tip = t.driverTip ?? 0;
  const discount = t.customerDiscount ?? 0;
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
    tip > 0 ? `🎁 اكرامية للسواق: ${formatMoney(tip)}` : "",
    discount > 0 ? `🏷️ خصم على العميل: ${formatMoney(discount)}` : "",
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
    t.time ? `🗓️ اليوم: ${t.time}` : "",
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
    t.time ? `🗓️ اليوم: ${t.time}` : "",
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
  advanceBalance: number;
};

/** تقرير دوري للمقاول (أسبوعي/شهري) */
export function contractorReport(r: PeriodReport): string {
  const advanceDebt = Math.max(r.advanceBalance, 0);
  const advanceCredit = Math.max(-r.advanceBalance, 0);
  const totalOnContractor = r.remainingTotal + advanceDebt;
  const net = totalOnContractor - advanceCredit;
  return (
    [
      `📊 تقرير ${r.periodLabel} — ${r.name}`,
      `🗓️ من ${formatShortDate(r.from)} إلى ${formatShortDate(r.to)}`,
      `🚛 عدد الرحلات: ${r.tripsCount}`,
      `💰 قيمة رحلات الفترة: ${formatMoney(r.total)}`,
      `✅ المحصّل خلال الفترة: ${formatMoney(r.settled)}`,
      "",
      "🧾 ملخص الحساب الحالي:",
      `• متبقي رحلات عليك: ${formatMoney(r.remainingTotal)}`,
      advanceDebt > 0 ? `• سلف/رصيد عليك: ${formatMoney(advanceDebt)}` : "",
      advanceCredit > 0 ? `• رصيد لك عندنا: ${formatMoney(advanceCredit)}` : "",
      `• إجمالي المطلوب قبل أي رصيد لك: ${formatMoney(totalOnContractor)}`,
      net > 0
        ? `🔴 الصافي المطلوب عليك: ${formatMoney(net)}`
        : net < 0
          ? `🟢 الصافي لك عندنا: ${formatMoney(-net)}`
          : "🟢 الحساب متعادل ولا يوجد صافي مستحق",
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

type DriverReportTrip = {
  date: Date;
  startPoint: string;
  endPoint: string;
  driverDue: number;
  paid: number;
};

type DriverReportData = {
  name: string;
  periodLabel: string;
  from: Date;
  to: Date;
  trips: DriverReportTrip[];
  total: number;
  settled: number;
  remainingTotal: number;
  advanceBalance: number;
};

/** تقرير دوري مفصّل للسواق (يشمل كل رحلة وسعرها + السلف) */
export function driverReport(r: DriverReportData): string {
  const advanceDebt = Math.max(r.advanceBalance, 0);
  const advanceCredit = Math.max(-r.advanceBalance, 0);
  const totalForDriver = r.remainingTotal + advanceCredit;
  const net = totalForDriver - advanceDebt;
  const header = [
    `📊 تقرير ${r.periodLabel} — ${r.name}`,
    `🗓️ من ${formatShortDate(r.from)} إلى ${formatShortDate(r.to)}`,
    `🚛 عدد الرحلات: ${r.trips.length}`,
  ];

  const tripLines = r.trips.length
    ? [
        "",
        "🚚 <b>تفاصيل الرحلات:</b>",
        ...r.trips.map((t, i) => {
          const rem = Math.max(t.driverDue - t.paid, 0);
          return (
            `${i + 1}) ${formatShortDate(t.date)} | ${t.startPoint} ← ${t.endPoint}\n` +
            `    مستحقك: ${formatMoney(t.driverDue)} — مدفوع: ${formatMoney(t.paid)}` +
            (rem > 0 ? ` — متبقٍّ: ${formatMoney(rem)}` : " ✅")
          );
        }),
      ]
    : [];

  const totals = [
    "",
    `💵 مستحقات رحلات الفترة: ${formatMoney(r.total)}`,
    `✅ المدفوع لك خلال الفترة: ${formatMoney(r.settled)}`,
    "",
    "🧾 ملخص الحساب الحالي:",
    `• متبقي رحلات لك: ${formatMoney(r.remainingTotal)}`,
    advanceDebt > 0 ? `• سلف عليك: ${formatMoney(advanceDebt)}` : "",
    advanceCredit > 0 ? `• رصيد لك عندنا: ${formatMoney(advanceCredit)}` : "",
    `• إجمالي مستحق لك قبل خصم السلف: ${formatMoney(totalForDriver)}`,
    net > 0
      ? `🟢 الصافي المستحق لك: ${formatMoney(net)}`
      : net < 0
        ? `🔴 الصافي عليك: ${formatMoney(-net)}`
        : "🟢 الحساب متعادل ولا يوجد صافي مستحق",
  ];

  return [...header, ...tripLines, ...totals].join("\n") + SIGNATURE;
}

/** رصيد الطرف: موجب = عليه لنا، سالب = لنا عليه (نحن مدينون له) */
function balanceLabel(balance: number): string {
  if (balance > 0) return `📊 عليه لنا الآن: ${formatMoney(balance)}`;
  if (balance < 0) return `📊 لنا عليه (مدينون له): ${formatMoney(-balance)}`;
  return "📊 الحساب صفر";
}

/** إشعار للأدمن بحركة سلفة/رصيد لطرف (سواق أو مقاول) في أي اتجاه */
export function adminAdvanceMessage(d: {
  partyLabel: string; // سواق | مقاول
  name: string;
  amount: number;
  method: string;
  note?: string | null;
  direction: string; // OUT | IN
  isOpening: boolean;
  balance: number;
}): string {
  const title = d.isOpening
    ? "🧾 <b>رصيد افتتاحي</b>"
    : d.direction === "OUT"
      ? "💳 <b>صرف سلفة</b>"
      : "✅ <b>استلام/سداد</b>";
  const dirLine =
    d.direction === "OUT"
      ? `⬅️ خرج من الخزنة: ${formatMoney(d.amount)}`
      : `➡️ دخل الخزنة: ${formatMoney(d.amount)}`;
  return (
    [
      title,
      `👤 ${d.partyLabel}: ${d.name}`,
      dirLine,
      `💳 الطريقة: ${methodLabel(d.method)}`,
      d.note ? `📝 ${d.note}` : "",
      balanceLabel(d.balance),
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** إشعار للأدمن بحذف حركة سلفة/رصيد */
export function adminAdvanceDeleteMessage(d: {
  partyLabel: string;
  name: string;
  amount: number;
  method: string;
  note?: string | null;
  direction: string;
  isOpening: boolean;
  balance: number;
}): string {
  const kind = d.isOpening
    ? "رصيد افتتاحي"
    : d.direction === "OUT"
      ? "صرف سلفة"
      : "استلام/سداد";
  const effect =
    d.direction === "OUT"
      ? `كانت خارجة من الخزنة: ${formatMoney(d.amount)}`
      : `كانت داخلة للخزنة: ${formatMoney(d.amount)}`;
  return (
    [
      "🗑️ <b>حذف معاملة سلفة/رصيد</b>",
      `👤 ${d.partyLabel}: ${d.name}`,
      `🧾 النوع: ${kind}`,
      `💵 ${effect}`,
      `💳 الطريقة: ${methodLabel(d.method)}`,
      d.note ? `📝 ${d.note}` : "",
      balanceLabel(d.balance),
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** تقرير توزيع أرباح على الشركاء (تيليجرام) */
export function adminDistributionMessage(d: {
  total: number;
  method: string;
  note?: string | null;
  shares: { name: string; percent: number; amount: number }[];
}): string {
  return (
    [
      "🥧 <b>توزيع أرباح على الشركاء</b>",
      `💰 إجمالي الموزّع: ${formatMoney(d.total)}`,
      `💳 الطريقة: ${methodLabel(d.method)}`,
      "",
      "👥 <b>نصيب كل شريك:</b>",
      ...d.shares.map(
        (s, i) => `${i + 1}) ${s.name} — ${s.percent}%: ${formatMoney(s.amount)}`
      ),
      d.note ? `\n📝 ${d.note}` : "",
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** إشعار للأدمن بتحويل بين وسائل الدفع */
export function adminTransferMessage(d: {
  from: string;
  to: string;
  amount: number;
}): string {
  return (
    [
      "🔄 <b>تحويل بين وسائل الدفع</b>",
      `↩️ من: ${methodLabel(d.from)}`,
      `↪️ إلى: ${methodLabel(d.to)}`,
      `💵 المبلغ: ${formatMoney(d.amount)}`,
    ].join("\n") + SIGNATURE
  );
}

/** إشعار للأدمن بإيداع/سحب نقدي */
export function adminCashAdjustMessage(d: {
  kind: "deposit" | "withdraw";
  method: string;
  amount: number;
  note?: string | null;
}): string {
  return (
    [
      d.kind === "deposit" ? "⬇️ <b>إيداع نقدي</b>" : "⬆️ <b>سحب نقدي</b>",
      `💵 المبلغ: ${formatMoney(d.amount)}`,
      `💳 الوسيلة: ${methodLabel(d.method)}`,
      d.note ? `📝 ${d.note}` : "",
    ]
      .filter(Boolean)
      .join("\n") + SIGNATURE
  );
}

/** تذكير للطرف بسداد ما عليه (واتساب) — عندما يكون مدينًا لنا */
export function advanceReminder(name: string, owedToUs: number): string {
  return (
    [
      `السلام عليكم ${name}`,
      `نذكّر حضرتك بوجود مبلغ متبقٍّ بقيمة ${formatMoney(owedToUs)}.`,
      "برجاء التكرم بالسداد أو التنسيق معنا. شكرًا 🌹",
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
