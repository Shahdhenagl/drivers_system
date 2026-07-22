import type { StatementRow } from "@/components/party-print-statement";

/**
 * العمليات المجمّعة (تحصيل من مقاول / سداد سواق) تُقسَّم داخليًا على الرحلات
 * المستحقة بالأقدم أولًا، فتنتج عشرات السجلات لدفعة واحدة. التقسيم ضروري
 * محاسبيًا، لكن المستخدم يريد أن يرى الحركة كما حدثت: «دفع 100,000».
 * هنا نجمع سجلات الدفعة الواحدة في صف واحد للعرض فقط — البيانات كما هي.
 */

/** علامات ربط داخلية داخل الملاحظات — تُخفى عن العرض */
const MARKER_RE = /\s*\[(?:c:(?:col|dp|adv|ext)|expense|withdrawal):[^\]]+\]/g;

/** يزيل العلامات الداخلية من الملاحظة قبل عرضها */
export function stripMarkers(note?: string | null): string | null {
  if (!note) return null;
  return note.replace(MARKER_RE, "").trim() || null;
}

/**
 * سجلات العملية الواحدة تُنشأ داخل معاملة واحدة، فتحمل نفس طابع الوقت تقريبًا.
 * 30 ثانية تكفي لأبطأ معاملة، وأقل بكثير من زمن ملء أي فورم مرتين — فعمليتان
 * منفصلتان لا تلتصقان ببعضهما.
 */
const BATCH_WINDOW_MS = 30 * 1000;

/**
 * يقسّم العناصر إلى دفعات: نفس المفتاح + متقاربة زمنيًا = دفعة واحدة.
 * العنصر بمفتاح فارغ يرجع في دفعة مستقلة (حركة قائمة بذاتها).
 */
export function groupByBatch<T>(
  items: T[],
  keyOf: (x: T) => string | null,
  stampOf: (x: T) => number
): T[][] {
  const out: T[][] = [];
  const buckets = new Map<string, T[]>();

  for (const it of items) {
    const key = keyOf(it);
    if (!key) {
      out.push([it]);
      continue;
    }
    const b = buckets.get(key);
    if (b) b.push(it);
    else buckets.set(key, [it]);
  }

  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort((a, b) => stampOf(a) - stampOf(b));
    let run: T[] = [];
    const flush = () => {
      if (run.length) out.push(run);
      run = [];
    };
    for (const it of sorted) {
      if (run.length && stampOf(it) - stampOf(run[run.length - 1]) > BATCH_WINDOW_MS) {
        flush();
      }
      run.push(it);
    }
    flush();
  }

  return out;
}

export type GroupedStatementRow = StatementRow & { members?: StatementRow[] };

/**
 * يجمع صفوف كشف الحساب الناتجة عن عملية واحدة في صف واحد،
 * ويحتفظ بالسجلات الأصلية في members لعرضها عند طلب التفاصيل.
 */
export function groupStatementRows(rows: StatementRow[]): GroupedStatementRow[] {
  return groupByBatch(
    rows,
    (r) => r.groupKey ?? null,
    (r) => +(r.createdAt ?? r.date)
  ).map(mergeRun);
}

function mergeRun(run: StatementRow[]): GroupedStatementRow {
  if (run.length === 1) return run[0];
  const first = run[0];
  const sum = (k: "forParty" | "onParty" | "paid" | "received") => {
    const total = run.reduce((s, r) => s + (r[k] ?? 0), 0);
    return total || undefined;
  };
  return {
    id: `group-${first.id}`,
    date: run.reduce((d, r) => (+r.date < +d ? r.date : d), first.date),
    createdAt: first.createdAt,
    description: first.description,
    details: `عملية واحدة موزّعة على ${run.length} رحلة`,
    forParty: sum("forParty"),
    onParty: sum("onParty"),
    paid: sum("paid"),
    received: sum("received"),
    members: run,
  };
}
