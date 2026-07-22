import type { Prisma } from "@prisma/client";

/**
 * السلفة الخارجية عبر المكتب لها ساقان مستقلتان:
 *   • ساق المستلِف (borrower): عليه للمكتب حتى يدفع — الباقي = amount − collectedAmount
 *   • ساق المُقرِض (lender): للمكتب عليه حتى يسلّمه — الباقي = amount − paidAmount
 * الفلوس اللي اتحصّلت ولسه ما اتسلّمتش = أمانة محتجزة في الخزنة (التزام لا ربح).
 * السلفة تُقفل (SETTLED) لما تكتمل الساقان معًا.
 */
/** أقلّ ما يلزم لحساب باقي الساقين */
export type LegAmounts = {
  amount: number;
  collectedAmount?: number | null;
  paidAmount?: number | null;
};

export type ExternalLegRow = LegAmounts & {
  id: string;
  borrowerType: string;
  borrowerId: string;
  lenderType: string;
  lenderId: string;
};

/** الباقي على المستلِف — يدفعه للمكتب */
export function owedByBorrower(r: LegAmounts): number {
  return Math.max(r.amount - (r.collectedAmount ?? 0), 0);
}

/** الباقي للمُقرِض — يستلمه من المكتب */
export function owedToLender(r: LegAmounts): number {
  return Math.max(r.amount - (r.paidAmount ?? 0), 0);
}

/** الأمانة المحتجزة في الخزنة لهذه السلفة = المحصَّل − المسلَّم */
export function heldByOffice(r: LegAmounts): number {
  return Math.max((r.collectedAmount ?? 0) - (r.paidAmount ?? 0), 0);
}

/** إجمالي ما على الطرف وما له من السلف الخارجية (بالباقي لا بالقيمة الكاملة) */
export function externalTotals(
  rows: ExternalLegRow[],
  partyType: string,
  partyId: string
): { on: number; for: number } {
  let on = 0;
  let forParty = 0;
  for (const r of rows) {
    if (r.borrowerType === partyType && r.borrowerId === partyId) {
      on += owedByBorrower(r);
    }
    if (r.lenderType === partyType && r.lenderId === partyId) {
      forParty += owedToLender(r);
    }
  }
  return { on, for: forParty };
}

/** ساقات المستلِف المفتوحة لطرف — الأقدم أولًا */
export function openBorrowerLegs<T extends ExternalLegRow>(
  rows: T[],
  partyType: string,
  partyId: string
): T[] {
  return rows.filter(
    (r) =>
      r.borrowerType === partyType &&
      r.borrowerId === partyId &&
      owedByBorrower(r) > 0
  );
}

/** ساقات المُقرِض المفتوحة لطرف — الأقدم أولًا */
export function openLenderLegs<T extends ExternalLegRow>(
  rows: T[],
  partyType: string,
  partyId: string
): T[] {
  return rows.filter(
    (r) =>
      r.lenderType === partyType &&
      r.lenderId === partyId &&
      owedToLender(r) > 0
  );
}

/**
 * يسجّل حركة على ساق من ساقي السلفة ويقفلها لو اكتملت الساقان.
 * collected = تحصيل من المستلِف، paid = تسليم للمُقرِض.
 */
export async function advanceLeg(
  tx: Prisma.TransactionClient,
  id: string,
  leg: "collected" | "paid",
  amount: number
) {
  if (amount <= 0) return;
  const row = await tx.externalAdvance.update({
    where: { id },
    data:
      leg === "collected"
        ? { collectedAmount: { increment: amount } }
        : { paidAmount: { increment: amount } },
  });
  const done = row.collectedAmount >= row.amount && row.paidAmount >= row.amount;
  if (done && row.status !== "SETTLED") {
    await tx.externalAdvance.update({
      where: { id },
      data: { status: "SETTLED", settledAt: new Date() },
    });
  }
}
