/**
 * اختبار خصوصية المكتب: يتأكد أن كل الرسائل والتقارير وكشوف الحساب
 * لا تسرّب سعر الطرف المقابل:
 *   • ما يُرسَل/يُطبَع للسواق  → لا يظهر فيه "سعر المقاول" إطلاقًا.
 *   • ما يُرسَل/يُطبَع للمقاول → لا يظهر فيه "مستحق السواق" إطلاقًا.
 *
 * التشغيل:  npx tsx --tsconfig tsconfig.test.json test/messages-privacy.test.tsx
 *
 * قيم مميّزة تُستخدم كبصمة: سعر المقاول = 7,777 ، مستحق السواق = 3,333.
 * (لا تظهر صدفةً في أي تاريخ أو رقم هاتف مستخدَم هنا).
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  adminNewTripMessage,
  contractorMessage,
  driverMessage,
  driverReminder,
  collectionReminder,
  driverReport,
  contractorReport,
} from "@/lib/messages";
import { PartyPrintStatement } from "@/components/party-print-statement";

// ── بصمات مالية ──────────────────────────────────────────────────────────
const CONTRACTOR_PRICE = 777700; // قروش → "7,777"
const DRIVER_DUE = 333300; // قروش → "3,333"
const CONTRACTOR_MARK = "7,777"; // سعر المقاول — ممنوع أمام السواق
const DRIVER_MARK = "3,333"; // مستحق السواق — ممنوع أمام المقاول
const LABEL_CONTRACTOR_PRICE = "سعر المقاول";
const LABEL_DRIVER_DUE = "مستحق السواق";

// ── بيانات مشتركة ────────────────────────────────────────────────────────
const D = (s: string) => new Date(s + "T09:00:00");
const from = D("2026-05-01");
const to = D("2026-05-07");
const tripDate = D("2026-05-03");

const tripForMsg = {
  date: tripDate,
  time: "السبت",
  startPoint: "القاهرة",
  endPoint: "الإسكندرية",
  description: "حمولة رمل",
  notes: "اتصل قبل الوصول",
  contractor: { name: "شركة النور", phone: "01000000001" },
  driver: { name: "أحمد السائق", phone: "01000000002" },
};

// ── محرّك التأكيدات ──────────────────────────────────────────────────────
let failures = 0;
let passes = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passes++;
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? "  — " + detail : ""}`);
  }
}
const mustNotHave = (name: string, text: string, needle: string) =>
  ok(name, !text.includes(needle), `تسرّب "${needle}"`);
const mustHave = (name: string, text: string, needle: string) =>
  ok(name, text.includes(needle), `مفقود "${needle}"`);

// ── 0) ضبط سلامة الاختبار: رسالة الأدمن يجب أن تحوي السعرين ──────────────
// (لو فشل هذا فالبصمات نفسها خاطئة ولا يُعتمد على باقي النتائج)
console.log("\n[0] ضبط سلامة البصمات — رسالة الأدمن تحوي السعرين معًا:");
const admin = adminNewTripMessage({
  ...tripForMsg,
  contractorPrice: CONTRACTOR_PRICE,
  driverDue: DRIVER_DUE,
});
mustHave("رسالة الأدمن تُظهر سعر المقاول", admin, CONTRACTOR_MARK);
mustHave("رسالة الأدمن تُظهر مستحق السواق", admin, DRIVER_MARK);

// ── 1) رسائل/تقارير السواق: ممنوع ظهور سعر المقاول ───────────────────────
console.log("\n[1] ما يخصّ السواق — بلا سعر المقاول:");
for (const [name, text] of [
  ["driverMessage", driverMessage(tripForMsg)],
  ["driverReminder", driverReminder(tripForMsg)],
  [
    "driverReport",
    driverReport({
      name: "أحمد السائق",
      periodLabel: "أسبوعي",
      from,
      to,
      trips: [
        {
          date: tripDate,
          startPoint: "القاهرة",
          endPoint: "الإسكندرية",
          vehicleType: "نقل ثقيل",
          driverDue: DRIVER_DUE,
          paid: 0,
        },
      ],
      total: DRIVER_DUE,
      settled: 0,
      remainingTotal: DRIVER_DUE,
      advanceBalance: 0,
      externalFor: 0,
      externalOn: 0,
    }),
  ],
] as const) {
  mustNotHave(`${name}: لا يحوي قيمة سعر المقاول`, text, CONTRACTOR_MARK);
  mustNotHave(`${name}: لا يحوي عبارة «سعر المقاول»`, text, LABEL_CONTRACTOR_PRICE);
}
// تحقّق إيجابي: تقرير السواق يُظهر مستحقه هو
mustHave(
  "driverReport يُظهر مستحق السواق نفسه",
  driverReport({
    name: "أحمد السائق",
    periodLabel: "أسبوعي",
    from,
    to,
    trips: [
      {
        date: tripDate,
        startPoint: "القاهرة",
        endPoint: "الإسكندرية",
        vehicleType: "نقل ثقيل",
        driverDue: DRIVER_DUE,
        paid: 0,
      },
    ],
    total: DRIVER_DUE,
    settled: 0,
    remainingTotal: DRIVER_DUE,
    advanceBalance: 0,
    externalFor: 0,
    externalOn: 0,
  }),
  DRIVER_MARK
);

// ── 2) رسائل/تقارير المقاول: ممنوع ظهور مستحق السواق ─────────────────────
console.log("\n[2] ما يخصّ المقاول — بلا مستحق السواق:");
const contractorRep = contractorReport({
  name: "شركة النور",
  periodLabel: "أسبوعي",
  from,
  to,
  trips: [
    {
      date: tripDate,
      startPoint: "القاهرة",
      endPoint: "الإسكندرية",
      vehicleType: "نقل ثقيل",
      price: CONTRACTOR_PRICE,
      collected: 0,
    },
  ],
  total: CONTRACTOR_PRICE,
  settled: 0,
  remainingTotal: CONTRACTOR_PRICE,
  advanceBalance: 0,
  externalFor: 0,
  externalOn: 0,
});
for (const [name, text] of [
  ["contractorMessage", contractorMessage(tripForMsg)],
  ["contractorReport", contractorRep],
  ["collectionReminder", collectionReminder(tripForMsg, "1,000 ج.م")],
] as const) {
  mustNotHave(`${name}: لا يحوي قيمة مستحق السواق`, text, DRIVER_MARK);
  mustNotHave(`${name}: لا يحوي عبارة «مستحق السواق»`, text, LABEL_DRIVER_DUE);
}
// تحقّق إيجابي: تقرير المقاول يُظهر سعره هو
mustHave("contractorReport يُظهر سعر المقاول نفسه", contractorRep, CONTRACTOR_MARK);

// ── 3) كشف الحساب المطبوع: جدول موحّد بمبالغ الطرف نفسه فقط ──────────────
// الجدول الواحد يعرض ما يبنيه الاستدعاء: كشف السواق يضع مستحقه في «ليه»،
// وكشف المقاول يضع سعره في «عليه» — فلا يتسرّب سعر الطرف المقابل إطلاقًا.
console.log("\n[3] كشف الحساب المطبوع — جدول موحّد بمبالغ الطرف نفسه:");
const summary = {
  totalForParty: 0,
  totalOnParty: 0,
  totalPaid: 0,
  totalReceived: 0,
  netLabel: "الحساب متعادل",
  netAmount: 0,
};
const base = {
  companyName: "مكتب رحلات الأصدقاء",
  partyName: "طرف",
  periodLabel: "كل الفترات",
  generatedAt: tripDate,
  summary,
};

const driverStmt = renderToStaticMarkup(
  <PartyPrintStatement
    {...base}
    partyType="سواق"
    rows={[
      {
        id: "t1",
        date: tripDate,
        description: "رحلة القاهرة ← الإسكندرية",
        details: "المقاول: شركة النور • كبيره • مؤكدة",
        forParty: DRIVER_DUE,
      },
    ]}
  />
);
mustNotHave("كشف السواق: لا يحوي قيمة سعر المقاول", driverStmt, CONTRACTOR_MARK);
mustNotHave("كشف السواق: لا يحوي عبارة «سعر المقاول»", driverStmt, LABEL_CONTRACTOR_PRICE);
mustHave("كشف السواق: يُظهر قيمة مستحق السواق", driverStmt, DRIVER_MARK);

const contractorStmt = renderToStaticMarkup(
  <PartyPrintStatement
    {...base}
    partyType="مقاول"
    rows={[
      {
        id: "t1",
        date: tripDate,
        description: "رحلة القاهرة ← الإسكندرية",
        details: "السواق: أحمد السائق • كبيره • مؤكدة",
        onParty: CONTRACTOR_PRICE,
      },
    ]}
  />
);
mustNotHave("كشف المقاول: لا يحوي قيمة مستحق السواق", contractorStmt, DRIVER_MARK);
mustNotHave("كشف المقاول: لا يحوي عبارة «مستحق السواق»", contractorStmt, LABEL_DRIVER_DUE);
mustHave("كشف المقاول: يُظهر قيمة سعر المقاول", contractorStmt, CONTRACTOR_MARK);

// ── النتيجة ──────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`نجح: ${passes} — فشل: ${failures}`);
if (failures > 0) {
  console.error("❌ فشل الاختبار — يوجد تسريب لسعر الطرف المقابل.");
  process.exit(1);
}
console.log("✅ كل الرسائل والتقارير والكشوف تحترم خصوصية المكتب.");
