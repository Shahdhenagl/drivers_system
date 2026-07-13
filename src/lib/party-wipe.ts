import type { Prisma } from "@prisma/client";
import { collectorAdvanceMarker } from "@/lib/collectors";

/** علامة السلفة الخارجية عبر السواق (نسخة مطابقة للتي في trips/actions) */
function viaDriverMarker(collectionId: string) {
  return `[via-driver:${collectionId}]`;
}

const notEmpty = <T>(v: T | undefined | false | null): v is T => Boolean(v);

/**
 * مسح كامل للأثر المالي لطرف (سواق أو مقاول) قبل حذفه — يُشغَّل داخل معاملة.
 * القرار (بطلب المكتب): حذف الطرف يمسح كل معاملاته المالية ويعكس أثرها على
 * الخزنة والأرباح كأن الطرف لم يوجد إطلاقًا:
 *   • رحلاته تُحذف بالكامل (مع تحصيلاتها/سداداتها/تحويلاتها عبر Cascade).
 *   • سلفه وأرصدته (مكتب/افتتاحي/ربح إضافي/إكرامية/مقاصّة) تُحذف.
 *   • سلف المحصّلين المرتبطة برحلاته أو بحركاته (عبر tripId أو علامات [c:*]) تُحذف.
 *   • السلف الخارجية التي يكون طرفًا فيها (مستلِفًا أو مُقرِضًا) تُحذف.
 *   • كل قيود دفتر الأستاذ المرتبطة تُحذف → الخزنة والأرباح تتعدّل بأثر رجعي.
 *
 * ملاحظة: لا يحذف سجل الطرف نفسه — يتركه للدالة المستدعية بعد النداء.
 */
export async function wipeParty(
  tx: Prisma.TransactionClient,
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string
) {
  // 1) رحلات الطرف ومعرّفات تحصيلاتها/سداداتها (نجمعها قبل الحذف لتنظيف الدفتر)
  const trips = await tx.trip.findMany({
    where:
      partyType === "DRIVER" ? { driverId: partyId } : { contractorId: partyId },
    include: {
      collections: { select: { id: true } },
      driverPayments: { select: { id: true } },
    },
  });
  const tripIds = trips.map((t) => t.id);
  const collectionIds = trips.flatMap((t) => t.collections.map((c) => c.id));
  const driverPaymentIds = trips.flatMap((t) =>
    t.driverPayments.map((p) => p.id)
  );

  // 2) سلف الطرف نفسه + السلف المربوطة برحلاته (سلف محصّلين على تلك الرحلات)
  const baseAdvances = await tx.advance.findMany({
    where: {
      OR: [
        { partyType, partyId },
        tripIds.length ? { tripId: { in: tripIds } } : undefined,
      ].filter(notEmpty),
    },
    select: { id: true },
  });
  let advanceIds = baseAdvances.map((a) => a.id);

  // 3) سلف محصّلين مرتبطة بعلامات بالحركات المحذوفة (col/dp/adv)
  const markers = [
    ...collectionIds.map((id) => collectorAdvanceMarker("col", id)),
    ...driverPaymentIds.map((id) => collectorAdvanceMarker("dp", id)),
    ...advanceIds.map((id) => collectorAdvanceMarker("adv", id)),
  ];
  if (markers.length) {
    const linked = await tx.advance.findMany({
      where: { OR: markers.map((m) => ({ note: { contains: m } })) },
      select: { id: true },
    });
    advanceIds = [...new Set([...advanceIds, ...linked.map((a) => a.id)])];
  }

  // 4) عكس قيود دفتر الأستاذ للحركات المحذوفة (الخزنة/الأرباح ترجع كأنها لم تكن)
  const ledgerOr: Prisma.LedgerEntryWhereInput[] = [
    collectionIds.length
      ? { refType: "Collection", refId: { in: collectionIds } }
      : undefined,
    driverPaymentIds.length
      ? { refType: "DriverPayment", refId: { in: driverPaymentIds } }
      : undefined,
    advanceIds.length
      ? { refType: "Advance", refId: { in: advanceIds } }
      : undefined,
  ].filter(notEmpty);
  if (ledgerOr.length) {
    await tx.ledgerEntry.deleteMany({ where: { OR: ledgerOr } });
  }

  // 5) سلف خارجية يكون الطرف فيها مستلِفًا أو مُقرِضًا، + المربوطة بتحصيلات محذوفة
  await tx.externalAdvance.deleteMany({
    where: {
      OR: [
        { borrowerType: partyType, borrowerId: partyId },
        { lenderType: partyType, lenderId: partyId },
      ],
    },
  });
  if (collectionIds.length) {
    await tx.externalAdvance.deleteMany({
      where: {
        OR: collectionIds.map((id) => ({
          note: { contains: viaDriverMarker(id) },
        })),
      },
    });
  }

  // 6) حذف السلف
  if (advanceIds.length) {
    await tx.advance.deleteMany({ where: { id: { in: advanceIds } } });
  }

  // 7) حذف الرحلات (Cascade يحذف التحصيلات/السدادات/التحويلات المرتبطة)
  if (tripIds.length) {
    await tx.trip.deleteMany({ where: { id: { in: tripIds } } });
  }

  // 8) احتياطي: أي سداد متبقٍّ للسواق خارج رحلاته (نادر) — ننظّف دفتره ثم نحذفه
  if (partyType === "DRIVER") {
    const stray = await tx.driverPayment.findMany({
      where: { driverId: partyId },
      select: { id: true },
    });
    if (stray.length) {
      const ids = stray.map((p) => p.id);
      await tx.ledgerEntry.deleteMany({
        where: { refType: "DriverPayment", refId: { in: ids } },
      });
      await tx.driverPayment.deleteMany({ where: { id: { in: ids } } });
    }
  }
}
