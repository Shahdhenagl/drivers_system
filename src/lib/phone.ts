// تحويل الأرقام المصرية إلى صيغة دولية لواتساب
// 01120442206  ->  201120442206

export function toWhatsAppNumber(raw: string): string {
  let n = (raw || "").replace(/[^\d]/g, "");
  if (!n) return "";
  // إزالة 00 أو + الدولية
  if (n.startsWith("0020")) n = n.slice(4);
  if (n.startsWith("20") && n.length === 12) return n; // أصلاً دولي
  if (n.startsWith("0")) n = n.slice(1); // إزالة الصفر المحلي
  // الرقم المصري 10 خانات بعد إزالة الصفر (1xxxxxxxxx)
  return "20" + n;
}

/** رابط واتساب جاهز للنقر مع نص الرسالة */
export function whatsAppLink(phone: string, message: string): string {
  const num = toWhatsAppNumber(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

/** عرض الرقم بصيغة محلية مقروءة */
export function displayPhone(raw: string): string {
  let n = (raw || "").replace(/[^\d]/g, "");
  if (n.startsWith("20") && n.length === 12) n = "0" + n.slice(2);
  return n;
}
