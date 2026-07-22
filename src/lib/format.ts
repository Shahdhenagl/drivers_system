import { format } from "date-fns";
import { ar } from "date-fns/locale";

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "EEEE d MMMM yyyy", { locale: ar });
}

export function formatShortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "d MMM yyyy", { locale: ar });
}

export function formatWeekday(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "EEEE", { locale: ar });
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "d MMM yyyy - HH:mm", { locale: ar });
}

/** صيغة input[type=date] */
export function toDateInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "yyyy-MM-dd");
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const TIMEZONE = "Africa/Cairo";

/** تاريخ اليوم بتوقيت القاهرة كنص "yyyy-MM-dd" (مستقل عن توقيت السيرفر) */
export function cairoDayStr(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

/** هل التاريخان في نفس اليوم بتوقيت القاهرة؟ */
export function sameCairoDay(a: Date | string, b: Date | string): boolean {
  return cairoDayStr(a) === cairoDayStr(b);
}

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/**
 * مفتاح الأسبوع = تاريخ السبت الذي يبدأ به الأسبوع كنص "yyyy-MM-dd".
 * الأسبوع المصري: يبدأ السبت وينتهي الجمعة.
 */
export function cairoWeekStr(d: Date | string = new Date()): string {
  const [y, m, day] = cairoDayStr(d).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, day));
  const daysSinceSat = (base.getUTCDay() + 1) % 7; // السبت=0 ... الجمعة=6
  base.setUTCDate(base.getUTCDate() - daysSinceSat);
  return base.toISOString().slice(0, 10);
}

/** حدود أسبوع من مفتاحه "yyyy-MM-dd" (السبت) كـ [from, toExclusive] بـ UTC */
export function weekBounds(ws: string): [Date, Date] {
  const [y, m, d] = ws.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return [start, end];
}

/** تسمية أسبوع عربية مثل "18 – 24 يوليو 2026" (وتُظهر الشهرين لو الأسبوع بينهما) */
export function weekLabel(ws: string): string {
  const [from, to] = weekBounds(ws);
  const last = new Date(to.getTime() - 86_400_000);
  const d1 = from.getUTCDate();
  const d2 = last.getUTCDate();
  const mo1 = AR_MONTHS[from.getUTCMonth()];
  const mo2 = AR_MONTHS[last.getUTCMonth()];
  const y2 = last.getUTCFullYear();
  return from.getUTCMonth() === last.getUTCMonth()
    ? `${d1} – ${d2} ${mo2} ${y2}`
    : `${d1} ${mo1} – ${d2} ${mo2} ${y2}`;
}

/** تسمية الأسبوع في قائمة الفلتر — مع تمييز الأسبوع الحالي والسابق */
export function weekOptionLabel(ws: string, currentWs = cairoWeekStr()): string {
  const label = weekLabel(ws);
  if (ws === currentWs) return `هذا الأسبوع • ${label}`;
  const [prevStart] = weekBounds(currentWs);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  if (ws === prevStart.toISOString().slice(0, 10))
    return `الأسبوع السابق • ${label}`;
  return label;
}

/** مفتاح الأسبوع المُزاح بعدد أسابيع (سالب = للخلف) */
export function shiftWeek(ws: string, weeks: number): string {
  const [start] = weekBounds(ws);
  start.setUTCDate(start.getUTCDate() + weeks * 7);
  return start.toISOString().slice(0, 10);
}

/**
 * حدود أسبوع يبدأ السبت وينتهي الجمعة (الأسبوع المصري) كـ [from, toExclusive] بـ UTC.
 * offsetWeeks=0 الأسبوع الحالي، -1 الأسبوع السابق، وهكذا.
 */
export function weekBoundsUTC(offsetWeeks = 0): [Date, Date] {
  const [y, m, d] = cairoDayStr().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0=الأحد .. 6=السبت
  const daysSinceSat = (dow + 1) % 7; // السبت=0، الأحد=1 ... الجمعة=6
  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - daysSinceSat + offsetWeeks * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return [start, end];
}

/** فرق توقيت منطقة زمنية عن UTC (بالملّي ثانية) عند لحظة معيّنة — مستقل عن توقيت السيرفر */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - instant.getTime();
}

/**
 * لحظة بدء الرحلة كـ Date (UTC) بدمج تاريخها (المخزَّن منتصف الليل UTC)
 * مع وقتها النصّي "HH:mm" مُفسَّرًا بتوقيت القاهرة (يراعي التوقيت الصيفي).
 * يُرجِع null لو لا يوجد وقت محدّد. مستقل عن توقيت السيرفر.
 */
export function tripStart(date: Date, time?: string | null): Date | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const utcGuess = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    h,
    m || 0
  );
  const offset = tzOffsetMs(TIMEZONE, new Date(utcGuess));
  return new Date(utcGuess - offset);
}
