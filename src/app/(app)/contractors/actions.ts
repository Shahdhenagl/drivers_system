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
import { resolveCollector, collectorAdvanceMarker } from "@/lib/collectors";
import { wipeParty } from "@/lib/party-wipe";
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
 * تحصيل مجمّع من المقاول — يوزَّع بالأقدم أولًا على الرحلات المستحقة.
 * أي زيادة عن المستحق تُسجَّل رصيدًا للمقاول (له عندنا).
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

  const trips = await prisma.trip.findMany({
    where: { contractorId },
    orderBy: { date: "asc" },
    include: { collections: true },
  });

  // الرحلات المستحقة مرتّبة بالأقدم
  type Item = {
    trip: (typeof trips)[number];
    eff: number;
    collected: number;
    remaining: number;
  };
  const items: Item[] = [];
  for (const t of trips) {
    const eff = effectiveAmounts(t).contractor;
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    const remaining = Math.max(eff - collected, 0);
    if (remaining > 0) items.push({ trip: t, eff, collected, remaining });
  }

  // لو التحصيل "عن طريق محصّل": كل المبلغ يبقى معاه (سلفة عليه) ولا يدخل الخزنة
  const collector = await resolveCollector(method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }
  // اسم المقاول يُحفظ على سلفة المحصّل عشان كشف حسابه يقول حصّل من مين
  const contractorName = collector
    ? (
        await prisma.contractor.findUnique({
          where: { id: contractorId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  await prisma.$transaction(async (tx) => {
    let left = amount;
    for (const it of items) {
      if (left <= 0) break;
      const pay = Math.min(it.remaining, left);
      left -= pay;
      const col = await tx.collection.create({
        data: { tripId: it.trip.id, amount: pay, method, date, note },
      });
      if (collector) {
        // المحصّل يمسك حصّة هذه الرحلة — سلفة عليه مربوطة بالتحصيل (بدون قيد خزنة).
        // الربط بعلامة col يضمن حذفها تلقائيًا مع حذف/تعديل التحصيل من أي مكان.
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: pay,
            direction: "OUT",
            method,
            note: `تحصيل عن طريق ${collector.name} ${collectorAdvanceMarker("col", col.id)}`,
            tripId: it.trip.id,
            sourceType: "CONTRACTOR",
            sourceId: contractorId,
            sourceName: contractorName,
            date,
          },
        });
      } else {
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
      if (collector) {
        // المحصّل يمسك الزيادة أيضًا — سلفة عليه مربوطة برصيد المقاول (بدون قيد خزنة)
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: left,
            direction: "OUT",
            method,
            note: `زيادة تحصيل عن طريق ${collector.name} ${collectorAdvanceMarker("adv", adv.id)}`,
            sourceType: "CONTRACTOR",
            sourceId: contractorId,
            sourceName: contractorName,
            date,
          },
        });
      } else {
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
  });

  await audit("COLLECT_ALL", "Contractor", contractorId, { amount, method });
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

/**
 * حذف المقاول = مسح كل أثره المالي تلقائيًا (رحلاته وتحصيلاتها وسداداتها وسلفه
 * وسلفه الخارجية وقيود الدفتر)، وتُعكَس الخزنة والأرباح كأنه لم يوجد.
 */
export async function deleteContractor(id: string) {
  await prisma.$transaction(async (tx) => {
    await wipeParty(tx, "CONTRACTOR", id);
    await tx.contractor.delete({ where: { id } });
  });
  await audit("DELETE", "Contractor", id);
  revalidatePath("/contractors");
  revalidatePath("/drivers");
  revalidatePath("/finance");
  revalidatePath("/");
  redirect("/contractors");
}
