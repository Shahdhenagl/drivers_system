"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend, treasuryByMethod } from "@/lib/finance";
import { resolveCollector } from "@/lib/collectors";
import { getFinanceOverview } from "@/lib/finance-overview";
import { toPiastres, formatMoney } from "@/lib/money";
import { methodLabel, PAYMENT_METHOD_KEYS } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
import { editAdvance, deleteAdvance } from "@/lib/advance-actions";
import {
  updateTripCollection,
  deleteTripCollection,
  updateTripDriverPayment,
  deleteTripDriverPayment,
  updateTripAdvance,
  deleteTripAdvance,
} from "@/app/(app)/trips/actions";
import {
  adminExpenseMessage,
  adminTransferMessage,
  adminCashAdjustMessage,
} from "@/lib/messages";

export async function addExpense(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const amount = toPiastres(get("amount") || "0");
  const method = get("method") || "cash";
  const fallback = get("fallback") === "1";
  const name = get("name");
  if (!name || amount <= 0) return { error: "اكتب اسم المصروف وقيمة صحيحة" };

  const dateStr = get("date");
  const date = dateStr ? new Date(dateStr) : new Date();

  // مصروف "عن طريق محصّل": يتدفع من فلوس المحصّل — يقلّل رصيده (بدون خزنة/قيد ربح)
  const collector = await resolveCollector(method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }
  if (collector) {
    await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          name,
          category: get("category") || null,
          amount,
          method,
          date,
          notes: get("notes") || null,
        },
      });
      // المحصّل صرف من الأمانة اللي معاه — يقلّل ما يمسكه للمكتب
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount,
          direction: "IN",
          method,
          note: `مصروف عن طريق ${collector.name}: ${name} [expense:${exp.id}]`,
          date,
        },
      });
    });
    await audit("CREATE", "Expense", undefined, { name, amount, method });
    revalidatePath("/finance");
    revalidatePath(`/drivers/${collector.id}`);
    revalidatePath("/drivers");
    revalidatePath("/");
    return;
  }

  // المصروفات تُخصم من الربح — لا تمسّ رأس المال (planSpend يمنع نزول الخزنة تحت الصفر)
  const ov = await getFinanceOverview();
  const available = Math.max(ov.distributableProfit, 0);
  if (amount > available) {
    return {
      error: `المبلغ المتاح من الربح (${formatMoney(available)}) أقل من المصروف — لا يمكن إتمام العملية`,
    };
  }

  // منع النزول تحت الصفر وحفظ رأس المال في الكاش (مع إمكان السحب من وسائل أخرى)
  const plan = await planSpend(method, amount, fallback);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    const exp = await tx.expense.create({
      data: {
        name,
        category: get("category") || null,
        amount,
        method,
        date,
        notes: get("notes") || null,
      },
    });
    for (const e of plan.entries) {
      await recordLedger(tx, {
        type: "EXPENSE",
        direction: "OUT",
        amount: e.amount,
        method: e.method,
        description:
          plan.entries.length > 1
            ? `مصروف — ${name} (${methodLabel(e.method)})`
            : `مصروف — ${name}`,
        refType: "Expense",
        refId: exp.id,
        date,
      });
    }
  });

  await audit("CREATE", "Expense", undefined, { name, amount });

  // إشعار الأدمن بالمصروف عبر تيليجرام (لا يعطّل التسجيل لو فشل)
  try {
    await sendTelegram(
      adminExpenseMessage({
        name,
        amount,
        category: get("category") || null,
        method,
        date,
      })
    );
  } catch {
    // تجاهل أي فشل في الإشعار
  }

  revalidatePath("/finance");
  revalidatePath("/");
}

/** تحويل مبلغ بين وسيلتي دفع — لا يؤثر على الربح ولا على إجمالي الخزنة */
export async function transferBetweenMethods(formData: FormData) {
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };
  if (!PAYMENT_METHOD_KEYS.includes(from as never) || !PAYMENT_METHOD_KEYS.includes(to as never)) {
    return { error: "اختر وسيلتي الدفع" };
  }
  if (from === to) return { error: "اختر وسيلتين مختلفتين" };

  // التحويل نقل بين وسائلك — يكفي ألا ينزل رصيد المصدر تحت الصفر
  const treasury = await treasuryByMethod();
  const available = treasury[from as keyof typeof treasury] ?? 0;
  if (amount > available) {
    return {
      error: `الرصيد لا يكفي في ${methodLabel(from)} — المتاح: ${formatMoney(available)}`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await recordLedger(tx, {
      type: "TRANSFER",
      direction: "OUT",
      amount,
      method: from,
      description: `تحويل إلى ${methodLabel(to)}`,
    });
    await recordLedger(tx, {
      type: "TRANSFER",
      direction: "IN",
      amount,
      method: to,
      description: `تحويل من ${methodLabel(from)}`,
    });
  });

  await audit("TRANSFER", "Treasury", undefined, { from, to, amount });

  try {
    await sendTelegram(adminTransferMessage({ from, to, amount }));
  } catch {
    // تجاهل فشل الإشعار
  }

  revalidatePath("/finance");
  revalidatePath("/");
}

/** إيداع أو سحب نقدي عام في الخزنة (لا يؤثر على الربح) */
export async function adjustTreasury(formData: FormData) {
  const kind = String(formData.get("kind") ?? "deposit"); // deposit | withdraw
  const method = String(formData.get("method") ?? "cash");
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  if (kind === "withdraw") {
    const plan = await planSpend(method, amount, false);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: false };
    }
  }

  await recordLedger(prisma, {
    type: kind === "withdraw" ? "WITHDRAWAL" : "DEPOSIT",
    direction: kind === "withdraw" ? "OUT" : "IN",
    amount,
    method,
    description:
      (kind === "withdraw" ? "سحب نقدي" : "إيداع نقدي") +
      (note ? ` — ${note}` : ""),
  });

  await audit(kind === "withdraw" ? "WITHDRAW_CASH" : "DEPOSIT_CASH", "Treasury", undefined, {
    amount,
    method,
  });

  try {
    await sendTelegram(
      adminCashAdjustMessage({
        kind: kind === "withdraw" ? "withdraw" : "deposit",
        method,
        amount,
        note: note || null,
      })
    );
  } catch {
    // تجاهل فشل الإشعار
  }

  revalidatePath("/finance");
  revalidatePath("/");
}

export async function deleteExpense(id: string) {
  const exp = await prisma.expense.findUnique({ where: { id } });
  if (!exp) return;
  const collector = await resolveCollector(exp.method);
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({
      where: { refType: "Expense", refId: id },
    });
    if (collector && !("notFound" in collector)) {
      const linkedAdvance = await tx.advance.findFirst({
        where: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount: exp.amount,
          direction: "IN",
          method: exp.method,
          OR: [
            { note: { contains: `[expense:${id}]` } },
            {
              note: `مصروف عن طريق ${collector.name}: ${exp.name}`,
              date: exp.date,
            },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (linkedAdvance) {
        await tx.advance.delete({ where: { id: linkedAdvance.id } });
      }
    }
    await tx.expense.delete({ where: { id } });
  });
  await audit("DELETE", "Expense", id);
  revalidatePath("/finance");
  if (collector && !("notFound" in collector)) {
    revalidatePath(`/drivers/${collector.id}`);
    revalidatePath("/drivers");
  }
  revalidatePath("/");
}

export async function updateExpense(id: string, formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const amount = toPiastres(get("amount") || "0");
  const method = get("method") || "cash";
  const name = get("name");
  const dateStr = get("date");
  const date = dateStr ? new Date(dateStr) : new Date();
  const category = get("category") || null;
  const notes = get("notes") || null;
  if (!name || amount <= 0) return { error: "اكتب اسم المصروف وقيمة صحيحة" };

  const exp = await prisma.expense.findUnique({ where: { id } });
  if (!exp) return { error: "المصروف غير موجود" };

  const oldCollector = await resolveCollector(exp.method);
  const nextCollector = await resolveCollector(method);
  if (nextCollector && "notFound" in nextCollector) {
    return { error: `المحصّل «${nextCollector.notFound}» غير موجود في السواقين` };
  }

  if (!nextCollector) {
    const ov = await getFinanceOverview();
    const available = Math.max(ov.distributableProfit + exp.amount, 0);
    if (amount > available) {
      return {
        error: `المبلغ المتاح من الربح (${formatMoney(available)}) أقل من المصروف`,
      };
    }

    const oldOut = await prisma.ledgerEntry.aggregate({
      where: { refType: "Expense", refId: id, direction: "OUT" },
      _sum: { amount: true },
    });
    const plan = await planSpend(method, amount, true, oldOut._sum.amount ?? 0);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({ where: { refType: "Expense", refId: id } });
      if (oldCollector && !("notFound" in oldCollector)) {
        await tx.advance.deleteMany({ where: { note: { contains: `[expense:${id}]` } } });
      }
      await tx.expense.update({
        where: { id },
        data: { name, category, amount, method, date, notes },
      });
      for (const e of plan.entries) {
        await recordLedger(tx, {
          type: "EXPENSE",
          direction: "OUT",
          amount: e.amount,
          method: e.method,
          description:
            plan.entries.length > 1
              ? `مصروف — ${name} (${methodLabel(e.method)})`
              : `مصروف — ${name}`,
          refType: "Expense",
          refId: id,
          date,
        });
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({ where: { refType: "Expense", refId: id } });
      await tx.advance.deleteMany({ where: { note: { contains: `[expense:${id}]` } } });
      await tx.expense.update({
        where: { id },
        data: { name, category, amount, method, date, notes },
      });
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: nextCollector.id,
          amount,
          direction: "IN",
          method,
          note: `مصروف عن طريق ${nextCollector.name}: ${name} [expense:${id}]`,
          date,
        },
      });
    });
  }

  await audit("UPDATE", "Expense", id, { name, amount, method });
  revalidatePath("/finance");
  if (oldCollector && !("notFound" in oldCollector)) revalidatePath(`/drivers/${oldCollector.id}`);
  if (nextCollector && !("notFound" in nextCollector)) revalidatePath(`/drivers/${nextCollector.id}`);
  revalidatePath("/drivers");
  revalidatePath("/");
}

export async function updateLedgerMovement(ledgerId: string, formData: FormData) {
  const entry = await prisma.ledgerEntry.findUnique({ where: { id: ledgerId } });
  if (!entry) return { error: "الحركة غير موجودة" };

  if (entry.refType === "Collection" && entry.refId) {
    return updateTripCollection(entry.refId, formData);
  }
  if (entry.refType === "DriverPayment" && entry.refId) {
    return updateTripDriverPayment(entry.refId, formData);
  }
  if (entry.refType === "Advance" && entry.refId) {
    const adv = await prisma.advance.findUnique({ where: { id: entry.refId } });
    if (!adv) return { error: "السلفة غير موجودة" };
    formData.set("direction", adv.direction);
    return adv.tripId
      ? updateTripAdvance(entry.refId, formData)
      : editAdvance(entry.refId, formData);
  }
  if (entry.refType === "Expense" && entry.refId) {
    return updateExpense(entry.refId, formData);
  }

  if (entry.type === "CAPITAL") return { error: "رأس المال لا يتعدل من دفتر الحركات" };

  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? entry.method);
  const note = String(formData.get("note") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : entry.date;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  if (entry.direction === "OUT") {
    const balances = await treasuryByMethod();
    const adjusted = { ...balances, [entry.method]: balances[entry.method as keyof typeof balances] + entry.amount };
    if ((adjusted[method as keyof typeof adjusted] ?? 0) < amount) {
      return { error: `الرصيد لا يكفي في ${methodLabel(method)}` };
    }
  }

  await prisma.ledgerEntry.update({
    where: { id: ledgerId },
    data: {
      amount,
      method,
      date,
      description: note || entry.description,
    },
  });
  await audit("UPDATE", "LedgerEntry", ledgerId, { amount, method });
  revalidatePath("/finance");
  revalidatePath("/");
}

export async function deleteLedgerMovement(ledgerId: string) {
  const entry = await prisma.ledgerEntry.findUnique({ where: { id: ledgerId } });
  if (!entry) return { error: "الحركة غير موجودة" };

  if (entry.refType === "Collection" && entry.refId) {
    return deleteTripCollection(entry.refId);
  }
  if (entry.refType === "DriverPayment" && entry.refId) {
    return deleteTripDriverPayment(entry.refId);
  }
  if (entry.refType === "Advance" && entry.refId) {
    const adv = await prisma.advance.findUnique({ where: { id: entry.refId } });
    if (!adv) return { error: "السلفة غير موجودة" };
    return adv.tripId ? deleteTripAdvance(entry.refId) : deleteAdvance(entry.refId);
  }
  if (entry.refType === "Expense" && entry.refId) {
    return deleteExpense(entry.refId);
  }

  if (entry.type === "CAPITAL") return { error: "رأس المال لا يتحذف من دفتر الحركات" };

  if (entry.direction === "IN") {
    const balances = await treasuryByMethod();
    const next = (balances[entry.method as keyof typeof balances] ?? 0) - entry.amount;
    if (next < 0) return { error: `حذف الحركة يجعل رصيد ${methodLabel(entry.method)} بالسالب` };
  }

  await prisma.ledgerEntry.delete({ where: { id: ledgerId } });
  await audit("DELETE", "LedgerEntry", ledgerId, entry);
  revalidatePath("/finance");
  revalidatePath("/");
}
