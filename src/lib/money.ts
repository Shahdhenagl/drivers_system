// كل المبالغ في قاعدة البيانات بالقروش (piastres) = الجنيه × 100

/** تحويل جنيه (رقم أو نص) إلى قروش صحيحة */
export function toPiastres(egp: number | string): number {
  const n = typeof egp === "string" ? parseFloat(egp.replace(/,/g, "")) : egp;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** تحويل قروش إلى جنيه (رقم) */
export function toEgp(piastres: number): number {
  return (piastres ?? 0) / 100;
}

/** تنسيق مبلغ بالقروش إلى نص بالجنيه مع الفاصلة */
export function formatMoney(piastres: number, withCurrency = true): string {
  const egp = toEgp(piastres ?? 0);
  const s = egp.toLocaleString("en-US", {
    minimumFractionDigits: egp % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return withCurrency ? `${s} ج.م` : s;
}
