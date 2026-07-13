import { prisma } from "@/lib/prisma";

/**
 * تنظيف تلقائي لأي حركة مالية طرفها اتحذف (سواق/مقاول) — تُشغَّل ذاتيًا عند
 * تحميل الماليات فلا تظهر أرصدة/معاملات ليتيمة أبدًا. آمنة ومتكرّرة (idempotent).
 *
 * تمسح:
 *   • السلف/الأرصدة (Advance) التي partyId فيها لطرف غير موجود.
 *   • السلف الخارجية (ExternalAdvance) التي اتمسح مستلِفها أو مُقرِضها.
 *   • الرحلات اليتيمة (سواق فارغ/محذوف أو مقاول محذوف) وأثرها الكامل.
 * ومعها قيود دفتر الأستاذ المرتبطة → الخزنة والأرباح ترجع كأنها لم تكن.
 * (حركات PARTNER لا تُمَس.)
 *
 * ترجّع إجمالي عدد ما حُذف؛ 0 يعني لا يوجد يتيم.
 */
export async function purgeOrphanFinance(): Promise<number> {
  const [drivers, contractors] = await Promise.all([
    prisma.driver.findMany({ select: { id: true } }),
    prisma.contractor.findMany({ select: { id: true } }),
  ]);
  const driverIds = new Set(drivers.map((d) => d.id));
  const contractorIds = new Set(contractors.map((c) => c.id));

  const partyExists = (type: string, id: string) =>
    type === "DRIVER"
      ? driverIds.has(id)
      : type === "CONTRACTOR"
        ? contractorIds.has(id)
        : true; // PARTNER أو أي نوع آخر — لا نلمسه

  const [advances, externals, trips] = await Promise.all([
    prisma.advance
      .findMany({ select: { id: true, partyType: true, partyId: true } })
      .catch(() => [] as { id: string; partyType: string; partyId: string }[]),
    prisma.externalAdvance
      .findMany({
        select: {
          id: true,
          borrowerType: true,
          borrowerId: true,
          lenderType: true,
          lenderId: true,
        },
      })
      .catch(
        () =>
          [] as {
            id: string;
            borrowerType: string;
            borrowerId: string;
            lenderType: string;
            lenderId: string;
          }[]
      ),
    prisma.trip.findMany({
      select: { id: true, driverId: true, contractorId: true },
    }),
  ]);

  const orphanAdvanceIds = advances
    .filter((a) => !partyExists(a.partyType, a.partyId))
    .map((a) => a.id);

  const orphanExternalIds = externals
    .filter(
      (e) =>
        !partyExists(e.borrowerType, e.borrowerId) ||
        !partyExists(e.lenderType, e.lenderId)
    )
    .map((e) => e.id);

  const orphanTripIds = trips
    .filter(
      (t) =>
        !t.driverId ||
        !driverIds.has(t.driverId) ||
        !contractorIds.has(t.contractorId)
    )
    .map((t) => t.id);

  if (
    !orphanAdvanceIds.length &&
    !orphanExternalIds.length &&
    !orphanTripIds.length
  ) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    const advIdsToWipe = [...orphanAdvanceIds];

    if (orphanTripIds.length) {
      // أطفال الرحلة (Collection/DriverPayment/TripTransfer) يُحذفون بالـ Cascade،
      // لكن قيود الدفتر مربوطة بـ refType/refId (بلا FK) فننظّفها يدويًا.
      const [cols, pays, tripAdvances] = await Promise.all([
        tx.collection.findMany({
          where: { tripId: { in: orphanTripIds } },
          select: { id: true },
        }),
        tx.driverPayment.findMany({
          where: { tripId: { in: orphanTripIds } },
          select: { id: true },
        }),
        tx.advance.findMany({
          where: { tripId: { in: orphanTripIds } },
          select: { id: true },
        }),
      ]);
      const colIds = cols.map((c) => c.id);
      const payIds = pays.map((p) => p.id);
      advIdsToWipe.push(...tripAdvances.map((a) => a.id));

      if (colIds.length) {
        await tx.ledgerEntry.deleteMany({
          where: { refType: "Collection", refId: { in: colIds } },
        });
      }
      if (payIds.length) {
        await tx.ledgerEntry.deleteMany({
          where: { refType: "DriverPayment", refId: { in: payIds } },
        });
      }
      await tx.ledgerEntry.deleteMany({
        where: { refType: "Trip", refId: { in: orphanTripIds } },
      });
    }

    const advIds = [...new Set(advIdsToWipe)];
    if (advIds.length) {
      await tx.ledgerEntry.deleteMany({
        where: { refType: "Advance", refId: { in: advIds } },
      });
      await tx.advance.deleteMany({ where: { id: { in: advIds } } });
    }

    if (orphanExternalIds.length) {
      await tx.externalAdvance.deleteMany({
        where: { id: { in: orphanExternalIds } },
      });
    }

    if (orphanTripIds.length) {
      await tx.trip.deleteMany({ where: { id: { in: orphanTripIds } } });
    }
  });

  return (
    orphanAdvanceIds.length + orphanExternalIds.length + orphanTripIds.length
  );
}
