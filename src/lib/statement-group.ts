import type { StatementRow } from "@/components/party-print-statement";

/**
 * العمليات المجمّعة (تحصيل من مقاول / سداد سواق) تُقسَّم داخليًا على الرحلات
 * المستحقة بالأقدم أولًا، فتنتج عشرات السجلات لدفعة واحدة. التقسيم ضروري
 * محاسبيًا، لكن المستخدم يريد أن يرى الحركة كما حدثت: «دفع 100,000».
 * هنا نجمع سجلات الدفعة الواحدة في صف واحد للعرض فقط — البيانات كما هي.
 */

/** علامات ربط داخلية داخل الملاحظات — تُخفى عن العرض */
const MARKER_RE = /\s*\[c:(?:col|dp|adv):[^\]]+\]/g;

/** يزيل العلامات الداخلية من الملاحظة قبل عرضها */
export function stripMarkers(note?: string | null): string | null {
  if (!note) return null;
  return note.replace(MARKER_RE, "").trim() || null;
}

export type GroupedStatementRow = StatementRow & { members?: StatementRow[] };

/** سجلات الدفعة الواحدة تُنشأ في نفس المعاملة خلال ثوانٍ — نافذة أمان 3 دقائق */
const BATCH_WINDOW_MS = 3 * 60 * 1000;

function stamp(r: StatementRow) {
  return +(r.createdAt ?? r.date);
}

/**
 * يجمع الصفوف التي تحمل نفس groupKey وأُنشئت في نفس النافذة الزمنية في صف واحد،
 * ويحتفظ بالسجلات الأصلية في members لعرضها عند طلب التفاصيل.
 */
export function groupStatementRows(rows: StatementRow[]): GroupedStatementRow[] {
  const out: GroupedStatementRow[] = [];
  const buckets = new Map<string, StatementRow[]>();

  for (const r of rows) {
    if (!r.groupKey) {
      out.push(r);
      continue;
    }
    const b = buckets.get(r.groupKey);
    if (b) b.push(r);
    else buckets.set(r.groupKey, [r]);
  }

  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort((a, b) => stamp(a) - stamp(b));
    let run: StatementRow[] = [];
    const flush = () => {
      if (run.length) out.push(mergeRun(run));
      run = [];
    };
    for (const r of sorted) {
      if (run.length && stamp(r) - stamp(run[run.length - 1]) > BATCH_WINDOW_MS) {
        flush();
      }
      run.push(r);
    }
    flush();
  }

  return out;
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
