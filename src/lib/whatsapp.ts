// اختيار تطبيق واتساب: العادي أو البزنس
// على أندرويد نستخدم Android intent لفتح التطبيق المحدد بالضبط،
// ومعه fallback إلى wa.me لو التطبيق غير مثبّت.

import { toWhatsAppNumber } from "@/lib/phone";

export type WaApp = "normal" | "business";

/** مفتاح تخزين التطبيق الافتراضي في localStorage */
export const WA_PREF_KEY = "wa_app_pref"; // "normal" | "business" (غير موجود = يسأل)

const PACKAGE: Record<WaApp, string> = {
  normal: "com.whatsapp",
  business: "com.whatsapp.w4b",
};

/**
 * رابط يفتح تطبيق واتساب محددًا (عادي/بزنس) عبر Android intent.
 * لو التطبيق غير مثبّت يفتح wa.me تلقائيًا.
 */
export function waAppLink(app: WaApp, phone: string, message: string): string {
  const num = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  const fallback = `https://wa.me/${num}?text=${text}`;
  return (
    `intent://send?phone=${num}&text=${text}` +
    `#Intent;scheme=whatsapp;package=${PACKAGE[app]};` +
    `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
  );
}
