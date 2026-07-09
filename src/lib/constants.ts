// اسم المكتب (يظهر في الواجهة ويُختَم به كل الرسائل)
export const COMPANY_NAME = "مكتب رحلات الأصدقاء";

/**
 * حالتان فقط: كل طلب يُسجَّل «مؤكدة»، ويتحوّل تلقائيًا إلى «مكتملة» لما يتم
 * التحصيل بالكامل من المقاول ويُسدَّد مستحق السواق بالكامل. أي تعديل يفتح
 * مبلغًا متبقيًا يرجّع الطلب «مؤكدة» تلقائيًا. الطلب قابل للتعديل في الحالتين.
 */
export const TRIP_STATUS = {
  CONFIRMED: "مؤكدة",
  COMPLETED: "مكتملة",
} as const;
export type TripStatus = keyof typeof TRIP_STATUS;

export const TRIP_STATUS_COLOR: Record<TripStatus, string> = {
  CONFIRMED: "bg-blue-500/15 text-blue-400",
  COMPLETED: "bg-success/15 text-success",
};

/** أي حالة قديمة (جديدة/قيد التنفيذ/ملغية) تُقرأ كـ«مؤكدة» */
export function tripStatus(status: string): TripStatus {
  return status === "COMPLETED" ? "COMPLETED" : "CONFIRMED";
}

// حالة التحصيل من المقاول
export const COLLECTION_STATUS = {
  NONE: "لم يتم التحصيل",
  PARTIAL: "تحصيل جزئي",
  FULL: "تم التحصيل بالكامل",
} as const;
export type CollectionStatus = keyof typeof COLLECTION_STATUS;

export const COLLECTION_STATUS_COLOR: Record<CollectionStatus, string> = {
  NONE: "bg-destructive/15 text-destructive",
  PARTIAL: "bg-warning/15 text-warning",
  FULL: "bg-success/15 text-success",
};

// طرق الدفع
export const PAYMENT_METHODS = {
  cash: "كاش",
  instapay: "إنستا باي",
  visa: "فيزا",
  wallet: "محفظة إلكترونية",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethod[];

// طريقة خاصة: التحصيل عن طريق السواق (لا تدخل الخزنة)
export const VIA_DRIVER = "via_driver";
// طريقة خاصة: مقاصّة مستحقات السواق مع سلفته (لا تدخل الخزنة)
export const OFFSET = "offset";

// طرق خاصة لحركات على الحساب لا تدخل الخزنة:
// ربح إضافي (الطرف يدين لنا، يزيد الربح) وإكرامية (نحن ندين له، تُخصم من الربح)
export const EXTRA_PROFIT_METHOD = "extra_profit";
export const TIP_METHOD = "party_tip";

// المحصّلون: سواقون يجمّعون فلوس المكتب. التحصيل/المصروف "عن طريقهم" يُقيَّد
// على حسابهم (سلفة) ولا يدخل خزنة المكتب حتى يُحصَّل منهم لاحقًا. ثابتون بالاسم.
export const COLLECTORS = ["عبد العزيز نوح", "عوض البطل"] as const;
export const COLLECTOR_METHOD_PREFIX = "عن طريق ";

/** قيمة طريقة الدفع لمحصّل معيّن، مثل: "عن طريق عبد العزيز نوح" */
export function collectorMethodValue(name: string): string {
  return `${COLLECTOR_METHOD_PREFIX}${name}`;
}

/** لو الطريقة تخص محصّلًا معروفًا يرجّع اسمه، وإلا null */
export function collectorNameFromMethod(m: string): string | null {
  if (!m.startsWith(COLLECTOR_METHOD_PREFIX)) return null;
  const name = m.slice(COLLECTOR_METHOD_PREFIX.length);
  return (COLLECTORS as readonly string[]).includes(name) ? name : null;
}

/** اسم طريقة الدفع للعرض (يشمل الطرق الخاصة والمحصّلين) */
export function methodLabel(m: string): string {
  if (m === VIA_DRIVER) return "عن طريق السواق";
  if (m === OFFSET) return "خصم من السلفة";
  if (m === EXTRA_PROFIT_METHOD) return "ربح إضافي";
  if (m === TIP_METHOD) return "إكرامية";
  // طرق المحصّلين مخزَّنة بنصها الظاهر ("عن طريق <اسم>") فتُعرض كما هي
  if (collectorNameFromMethod(m)) return m;
  return PAYMENT_METHODS[m as PaymentMethod] ?? m;
}

// فئات المصروفات
export const EXPENSE_CATEGORIES = [
  "إيجار",
  "بنزين",
  "مرتبات",
  "صيانة",
  "عام",
] as const;

// أنواع قيود دفتر الأستاذ
export const LEDGER_TYPE = {
  CAPITAL: "رأس المال",
  COLLECTION: "تحصيل من مقاول",
  DRIVER_PAYMENT: "سداد سواق",
  DRIVER_ADVANCE: "سلفة سواق",
  DRIVER_ADVANCE_REPAYMENT: "سداد سلفة سواق",
  ADVANCE_OUT: "سلفة/رصيد (صرف)",
  ADVANCE_IN: "سلفة/رصيد (استلام)",
  CUSTODY_IN: "أمانة سلفة خارجية (استلام)",
  CUSTODY_OUT: "أمانة سلفة خارجية (تسليم)",
  EXTRA_PROFIT: "ربح إضافي",
  DRIVER_TIP: "إكرامية سواق",
  EXPENSE: "مصروف",
  PARTNER_WITHDRAWAL: "سحب شريك",
  TRANSFER: "تحويل بين الوسائل",
  DEPOSIT: "إيداع نقدي",
  WITHDRAWAL: "سحب نقدي",
  OPENING_BALANCE: "رصيد افتتاحي",
  ADJUSTMENT: "تسوية",
} as const;
export type LedgerType = keyof typeof LEDGER_TYPE;
