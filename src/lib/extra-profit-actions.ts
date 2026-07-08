"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend } from "@/lib/finance";
import { resolveCollector } from "@/lib/collectors";
import { toPiastres } from "@/lib/money";

/**
 * تحصيل ربح إضافي من طرف (مقاول/سواق) — دخل للمكتب خارج الرحلات.
 * يُحصَّل فورًا بطريقة دفع (كاش يدخل الخزنة، أو عن طريق محصّل يمسكه) ويُضاف للربح.
 * لا يغيّر رصيد الطرف (دفعه وخلص).
 */
export async function recordExtraProfit(
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const name =
    partyType === "DRIVER"
      ? (await prisma.driver.findUnique({ where: { id: partyId }, select: { name: true } }))?.name
      : (await prisma.contractor.findUnique({ where: { id: partyId }, select: { name: true } }))?.name;
  if (!name) return { error: "الطرف غير موجود" };

  const collector = await resolveCollector(method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }

  await prisma.$transaction(async (tx) => {
    // قيد دخل: يُضاف للربح؛ يدخل الخزنة فقط لو الطريقة عادية (طرق المحصّلين مستثناة)
    await recordLedger(tx, {
      type: "EXTRA_PROFIT",
      direction: "IN",
      amount,
      method,
      description: `ربح إضافي — ${name}${note ? " — " + note : ""}`,
      refType: partyType === "DRIVER" ? "Driver" : "Contractor",
      refId: partyId,
      date,
    });
    if (collector) {
      // المحصّل يمسك الفلوس نيابةً عن المكتب — سلفة عليه
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount,
          direction: "OUT",
          method,
          note: `ربح إضافي عن طريق ${collector.name}`,
          date,
        },
      });
    }
  });

  await audit(
    "EXTRA_PROFIT",
    partyType === "DRIVER" ? "Driver" : "Contractor",
    partyId,
    { amount, method }
  );
  const base = partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
  revalidatePath("/");
}

/**
 * إكرامية/مكافأة للسواق — تُدفع له وتُخصم من ربح المكتب.
 * الطريقة عادية = كاش يخرج من الخزنة، أو عن طريق محصّل = يدفعها من الأمانة اللي معاه.
 */
export async function recordDriverTip(driverId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { name: true },
  });
  if (!driver) return { error: "السواق غير موجود" };

  const collector = await resolveCollector(method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }

  // طريقة عادية → الكاش يخرج من الخزنة (منع النزول تحت الصفر)
  if (!collector) {
    const plan = await planSpend(method, amount, false);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }
  }

  await prisma.$transaction(async (tx) => {
    // قيد يُخصم من الربح؛ يخرج من الخزنة فقط لو الطريقة عادية (طرق المحصّلين مستثناة)
    await recordLedger(tx, {
      type: "DRIVER_TIP",
      direction: "OUT",
      amount,
      method,
      description: `إكرامية — ${driver.name}${note ? " — " + note : ""}`,
      refType: "Driver",
      refId: driverId,
      date,
    });
    if (collector) {
      // المحصّل دفع الإكرامية من الأمانة اللي معاه — يقلّ ما يمسكه
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount,
          direction: "IN",
          method,
          note: `إكرامية عن طريق ${collector.name}`,
          date,
        },
      });
    }
  });

  await audit("DRIVER_TIP", "Driver", driverId, { amount, method });
  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
  revalidatePath("/");
}

/** حذف قيد ربح إضافي (وأي سلفة محصّل مرتبطة بنفس اللحظة يدويًا) */
export async function deleteExtraProfit(id: string) {
  await prisma.ledgerEntry.delete({ where: { id } }).catch(() => {});
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}
