"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend } from "@/lib/finance";
import { toPiastres } from "@/lib/money";
import { methodLabel, isSystemAdvanceMethod } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
import { adminAdvanceDeleteMessage, adminAdvanceMessage } from "@/lib/messages";

async function partyName(
  partyType: string,
  partyId: string
): Promise<string | null> {
  if (partyType === "DRIVER") {
    const d = await prisma.driver.findUnique({
      where: { id: partyId },
      select: { name: true },
    });
    return d?.name ?? null;
  }
  const c = await prisma.contractor.findUnique({
    where: { id: partyId },
    select: { name: true },
  });
  return c?.name ?? null;
}

/** رصيد الطرف: مجموع OUT − مجموع IN (موجب = عليه لنا، سالب = لنا عليه) */
export async function advanceBalance(
  partyType: string,
  partyId: string
): Promise<number> {
  const rows = await prisma.advance
    .groupBy({
      by: ["direction"],
      where: { partyType, partyId },
      _sum: { amount: true },
    })
    .catch(() => [] as { direction: string; _sum: { amount: number | null } }[]);
  let out = 0;
  let inn = 0;
  for (const r of rows) {
    if (r.direction === "OUT") out = r._sum.amount ?? 0;
    else if (r.direction === "IN") inn = r._sum.amount ?? 0;
  }
  return out - inn;
}

/**
 * حركة سلفة/رصيد لطرف (سواق أو مقاول):
 * direction=OUT: تخرج من الخزنة (الطرف يدين لنا). تحترم منع السالب + السحب من وسيلة أخرى.
 * direction=IN: تدخل الخزنة (سداد منه أو نحن مدينون له).
 * isOpening=1: رصيد افتتاحي / سلفة سابقة.
 */
export async function addAdvance(formData: FormData) {
  const partyType = String(formData.get("partyType") ?? "");
  const partyId = String(formData.get("partyId") ?? "");
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const direction = String(formData.get("direction") ?? "OUT");
  const isOpening = String(formData.get("isOpening") ?? "") === "1";
  const fallback = String(formData.get("fallback") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();

  if (partyType !== "DRIVER" && partyType !== "CONTRACTOR")
    return { error: "طرف غير صحيح" };
  if (direction !== "OUT" && direction !== "IN")
    return { error: "اتجاه غير صحيح" };
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const name = await partyName(partyType, partyId);
  if (!name) return { error: "الطرف غير موجود" };

  const label = isOpening ? "رصيد افتتاحي" : "سلفة";
  const pLabel = partyType === "DRIVER" ? "سواق" : "مقاول";

  if (direction === "OUT") {
    const plan = await planSpend(method, amount, fallback);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }
    await prisma.$transaction(async (tx) => {
      const adv = await tx.advance.create({
        data: { partyType, partyId, amount, direction: "OUT", method, note, isOpening, date },
      });
      for (const e of plan.entries) {
        await recordLedger(tx, {
          type: isOpening ? "OPENING_BALANCE" : "ADVANCE_OUT",
          direction: "OUT",
          amount: e.amount,
          method: e.method,
          description:
            `${label} ${pLabel} — ${name}` +
            (plan.entries.length > 1 ? ` (${methodLabel(e.method)})` : ""),
          refType: "Advance",
          refId: adv.id,
          date,
        });
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const adv = await tx.advance.create({
        data: { partyType, partyId, amount, direction: "IN", method, note, isOpening, date },
      });
      await recordLedger(tx, {
        type: isOpening ? "OPENING_BALANCE" : "ADVANCE_IN",
        direction: "IN",
        amount,
        method,
        description: `${label} من ${pLabel} — ${name}`,
        refType: "Advance",
        refId: adv.id,
        date,
      });
    });
  }

  await audit(
    isOpening ? "OPENING" : "ADVANCE",
    partyType === "DRIVER" ? "Driver" : "Contractor",
    partyId,
    { amount, direction, method }
  );

  try {
    const balance = await advanceBalance(partyType, partyId);
    await sendTelegram(
      adminAdvanceMessage({ partyLabel: pLabel, name, amount, method, note, direction, isOpening, balance })
    );
  } catch {
    // تجاهل فشل الإشعار
  }

  const base = partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
}

/**
 * تعديل حركة سلفة/رصيد قائمة (القيمة/الوسيلة/الاتجاه/التاريخ/الملاحظة).
 * يستبدل قيود دفتر الأستاذ القديمة بقيد جديد يعكس القيم الجديدة،
 * فينعكس التغيير مباشرةً على الخزنة والميزانية (المشتقّة من الدفتر).
 */
export async function editAdvance(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const direction = String(formData.get("direction") ?? "OUT");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();

  if (direction !== "OUT" && direction !== "IN")
    return { error: "اتجاه غير صحيح" };
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const adv = await prisma.advance.findUnique({ where: { id } });
  if (!adv) return { error: "الحركة غير موجودة" };

  // حركات مولّدة تلقائيًا (مقاصّة/محصّل/عن طريق السواق/ربح إضافي/إكرامية) لا تُعدَّل من هنا
  if (isSystemAdvanceMethod(adv.method)) {
    return {
      error:
        "هذه حركة مرتبطة بعملية أخرى (مقاصّة/تحصيل عن طريق طرف) — عدّلها من مصدرها لا من لوحة السلف",
    };
  }

  const name = await partyName(adv.partyType, adv.partyId);
  if (!name) return { error: "الطرف غير موجود" };

  const label = adv.isOpening ? "رصيد افتتاحي" : "سلفة";
  const pLabel = adv.partyType === "DRIVER" ? "سواق" : "مقاول";
  const ledgerType = adv.isOpening
    ? "OPENING_BALANCE"
    : direction === "OUT"
      ? "ADVANCE_OUT"
      : "ADVANCE_IN";

  // صرف جديد (OUT): امنع نزول الخزنة تحت الصفر — احسب المتاح بعد استبعاد القيد القديم
  let outEntries: { method: string; amount: number }[] = [{ method, amount }];
  if (direction === "OUT") {
    const oldOut =
      adv.direction === "OUT"
        ? await prisma.ledgerEntry.aggregate({
            where: { refType: "Advance", refId: id, direction: "OUT" },
            _sum: { amount: true },
          })
        : { _sum: { amount: 0 } };
    // نعيد إضافة القيمة القديمة افتراضيًا ثم نخطّط الصرف الجديد على الرصيد المصحّح
    const plan = await planSpend(method, amount, false, oldOut._sum.amount ?? 0);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }
    outEntries = plan.entries;
  }

  await prisma.$transaction(async (tx) => {
    // احذف قيود الدفتر القديمة لهذه الحركة (قد تكون أكثر من قيد لو صُرفت من عدة وسائل)
    await tx.ledgerEntry.deleteMany({ where: { refType: "Advance", refId: id } });
    await tx.advance.update({
      where: { id },
      data: { amount, method, note, direction, date },
    });
    if (direction === "OUT") {
      for (const e of outEntries) {
        await recordLedger(tx, {
          type: ledgerType,
          direction: "OUT",
          amount: e.amount,
          method: e.method,
          description:
            `${label} ${pLabel} — ${name}` +
            (outEntries.length > 1 ? ` (${methodLabel(e.method)})` : ""),
          refType: "Advance",
          refId: id,
          date,
        });
      }
    } else {
      await recordLedger(tx, {
        type: ledgerType,
        direction: "IN",
        amount,
        method,
        description: `${label} من ${pLabel} — ${name}`,
        refType: "Advance",
        refId: id,
        date,
      });
    }
  });

  await audit(
    "EDIT",
    adv.partyType === "DRIVER" ? "Driver" : "Contractor",
    adv.partyId,
    { advanceId: id, amount, direction, method }
  );

  const base = adv.partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${adv.partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
}

/** حذف حركة سلفة/رصيد ومعها قيود دفتر الأستاذ المرتبطة بها، فتتحدث الخزنة والأرصدة تلقائيًا. */
export async function deleteAdvance(id: string) {
  const adv = await prisma.advance.findUnique({ where: { id } });
  if (!adv) return { error: "الحركة غير موجودة" };

  // حركات مولّدة تلقائيًا لها نصف مقابل على رحلة — حذفها من هنا يترك الحساب مختلًّا
  if (isSystemAdvanceMethod(adv.method)) {
    return {
      error:
        "هذه حركة مرتبطة بعملية أخرى (مقاصّة/تحصيل عن طريق طرف) — احذفها من مصدرها لا من لوحة السلف",
    };
  }

  const name = await partyName(adv.partyType, adv.partyId);
  if (!name) return { error: "الطرف غير موجود" };
  const pLabel = adv.partyType === "DRIVER" ? "سواق" : "مقاول";

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { refType: "Advance", refId: id } });
    await tx.advance.delete({ where: { id } });
  });

  await audit(
    "DELETE",
    adv.partyType === "DRIVER" ? "Driver" : "Contractor",
    adv.partyId,
    {
      advanceId: id,
      amount: adv.amount,
      direction: adv.direction,
      method: adv.method,
    }
  );

  try {
    const balance = await advanceBalance(adv.partyType, adv.partyId);
    await sendTelegram(
      adminAdvanceDeleteMessage({
        partyLabel: pLabel,
        name,
        amount: adv.amount,
        method: adv.method,
        note: adv.note,
        direction: adv.direction,
        isOpening: adv.isOpening,
        balance,
      })
    );
  } catch {
    // تجاهل فشل الإشعار
  }

  const base = adv.partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${adv.partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
}
