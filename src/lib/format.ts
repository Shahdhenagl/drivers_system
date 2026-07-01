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
