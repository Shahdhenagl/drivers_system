// اسم المكتب (يظهر في الواجهة ويُختَم به كل الرسائل)
export const COMPANY_NAME = "مكتب رحلات الأصدقاء";

// حالات الرحلة
export const TRIP_STATUS = {
  NEW: "جديدة",
  CONFIRMED: "مؤكدة",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغية",
} as const;
export type TripStatus = keyof typeof TRIP_STATUS;

export const TRIP_STATUS_COLOR: Record<TripStatus, string> = {
  NEW: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-warning/15 text-warning",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-destructive/15 text-destructive",
};

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

/** اسم طريقة الدفع للعرض (يشمل الطرق الخاصة) */
export function methodLabel(m: string): string {
  if (m === VIA_DRIVER) return "عن طريق السواق";
  if (m === OFFSET) return "خصم من السلفة";
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
  EXPENSE: "مصروف",
  PARTNER_WITHDRAWAL: "سحب شريك",
  TRANSFER: "تحويل بين الوسائل",
  DEPOSIT: "إيداع نقدي",
  WITHDRAWAL: "سحب نقدي",
  OPENING_BALANCE: "رصيد افتتاحي",
  ADJUSTMENT: "تسوية",
} as const;
export type LedgerType = keyof typeof LEDGER_TYPE;
