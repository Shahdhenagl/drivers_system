"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  recordLedger,
  effectiveAmounts,
  deriveCollectionStatus,
} from "@/lib/finance";
import { resolveCollector } from "@/lib/collectors";
import { toPiastres } from "@/lib/money";

export async function createContractor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  const c = await prisma.contractor.create({
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("CREATE", "Contractor", c.id, { name });
  revalidatePath("/contractors");
}

export async function updateContractor(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  await prisma.contractor.update({
    where: { id },
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Contractor", id);
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${id}`);
}

/**
 * تحصيل مجمّع من المقاول — يوزَّع بالأقدم أولًا على الرحلات المستحقة **والسلف الخارجية**
 * التي المقاول فيها هو المستلِف (لأن المكتب هو اللي بيجمّعها). الرحلات والسلف تُرتَّب
 * بتاريخها سويًا. السلفة الخارجية تدخل الخزنة كـ"أمانة" (تزوّد الكاش لا الربح) وتُعلَّم
 * مسدَّدة (كليًا أو جزئيًا). أي زيادة عن المستحق تُسجَّل رصيدًا للمقاول (له عندنا).
 */
export async function collectAllFromContractor(
  contractorId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || "تحصيل مجمّع";
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const [trips, externals] = await Promise.all([
    prisma.trip.findMany({
      where: { contractorId },
      orderBy: { date: "asc" },
      include: { collections: true },
    }),
    // السلف الخارجية التي المقاول فيها هو المستلِف (عليه) وغير مكتملة السداد
    prisma.externalAdvance
      .findMany({
        where: { borrowerType: "CONTRACTOR", borrowerId: contractorId },
        orderBy: { date: "asc" },
      })
      .then((rows) => rows.filter((r) => r.amount - r.collectedAmount > 0))
      .catch(() => []),
  ]);

  // بنود مستحقة موحّدة (رحلات + سلف خارجية) مرتّبة بالتاريخ الأقدم أولًا
  type Item =
    | { kind: "trip"; date: Date; trip: (typeof trips)[number]; eff: number; collected: number; remaining: number }
    | { kind: "ext"; date: Date; ext: (typeof externals)[number]; remaining: number };
  const items: Item[] = [];
  for (const t of trips) {
    const eff = effectiveAmounts(t).contractor;
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    const remaining = Math.max(eff - collected, 0);
    if (remaining > 0) items.push({ kind: "trip", date: t.date, trip: t, eff, collected, remaining });
  }
  for (const e of externals) {
    items.push({ kind: "ext", date: e.date, ext: e, remaining: e.amount - e.collectedAmount });
  }
  items.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  // لو التحصيل "عن طريق محصّل": كل المبلغ يبقى معاه (سلفة عليه) ولا يدخل الخزنة
  const collector = await resolveCollector(method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }

  let custodyCollected = 0;
  await prisma.$transaction(async (tx) => {
    let left = amount;
    for (const it of items) {
      if (left <= 0) break;
      const pay = Math.min(it.remaining, left);
      left -= pay;
      if (it.kind === "trip") {
        const col = await tx.collection.create({
          data: { tripId: it.trip.id, amount: pay, method, date, note },
        });
        if (!collector) {
          await recordLedger(tx, {
            type: "COLLECTION",
            direction: "IN",
            amount: pay,
            method,
            description: `تحصيل — رحلة ${it.trip.startPoint} ← ${it.trip.endPoint}`,
            refType: "Collection",
            refId: col.id,
            date,
          });
        }
        await tx.trip.update({
          where: { id: it.trip.id },
          data: {
            collectionStatus: deriveCollectionStatus(it.eff, it.collected + pay),
          },
        });
      } else {
        // ساق المستلِف: تحصيل المكتب من المقاول (borrower)
        const collected = it.ext.collectedAmount + pay;
        const done = collected >= it.ext.amount && it.ext.paidAmount >= it.ext.amount;
        await tx.externalAdvance.update({
          where: { id: it.ext.id },
          data: {
            collectedAmount: collected,
            status: done ? "SETTLED" : "OPEN",
            settledAt: done ? date : null,
          },
        });
        if (!collector) {
          // أمانة: تدخل خزنة المكتب (كاش) لكن لا تُحتسب ربحًا — هتتدفع لصاحب السلفة
          await recordLedger(tx, {
            type: "CUSTODY_IN",
            direction: "IN",
            amount: pay,
            method,
            description: `أمانة سلفة خارجية — ${it.ext.lenderName} من ${it.ext.borrowerName}`,
            refType: "ExternalAdvance",
            refId: it.ext.id,
            date,
          });
        }
        custodyCollected += pay;
      }
    }

    // الزيادة عن المستحق → رصيد للمقاول (له عندنا)
    if (left > 0) {
      const adv = await tx.advance.create({
        data: {
          partyType: "CONTRACTOR",
          partyId: contractorId,
          amount: left,
          direction: "IN",
          method,
          note: "رصيد (زيادة عن المستحق في التحصيل)",
          date,
        },
      });
      if (!collector) {
        await recordLedger(tx, {
          type: "ADVANCE_IN",
          direction: "IN",
          amount: left,
          method,
          description: "رصيد مقاول (زيادة عن المستحق)",
          refType: "Advance",
          refId: adv.id,
          date,
        });
      }
    }

    // المحصّل يمسك كل المبلغ نيابةً عن المكتب — سلفة عليه (بدون قيد خزنة)
    if (collector) {
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount,
          direction: "OUT",
          method,
          note: `تحصيل مجمّع عن طريق ${collector.name}`,
          date,
        },
      });
    }
  });

  await audit("COLLECT_ALL", "Contractor", contractorId, {
    amount,
    method,
    custody: custodyCollected,
  });
  revalidatePath(`/contractors/${contractorId}`);
  revalidatePath("/contractors");
  revalidatePath("/finance");
  revalidatePath("/");
}

/** علامة المراجعة اليومية: reviewed=true يسجّل الآن، false يمسحها */
export async function setContractorReviewed(id: string, reviewed: boolean) {
  await prisma.contractor.update({
    where: { id },
    data: { lastReviewedAt: reviewed ? new Date() : null },
  });
  revalidatePath(`/contractors/${id}`);
}

export async function deleteContractor(id: string) {
  const trips = await prisma.trip.findMany({
    where: { contractorId: id },
    select: {
      _count: { select: { collections: true, driverPayments: true } },
    },
  });
  const hasMoney = trips.some(
    (t) => t._count.collections > 0 || t._count.driverPayments > 0
  );
  if (hasMoney) {
    return {
      error:
        "لا يمكن حذف هذا المقاول لوجود تحصيل أو سداد مسجّل على رحلاته. احذف الطلبات المعنية أولًا.",
    };
  }

  // حذف رحلاته الفارغة ثم حذفه
  await prisma.$transaction(async (tx) => {
    await tx.trip.deleteMany({ where: { contractorId: id } });
    await tx.contractor.delete({ where: { id } });
  });
  await audit("DELETE", "Contractor", id);
  revalidatePath("/contractors");
  redirect("/contractors");
}
