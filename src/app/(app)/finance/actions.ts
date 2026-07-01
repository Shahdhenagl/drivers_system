"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend, treasuryByMethod } from "@/lib/finance";
import { getFinanceOverview } from "@/lib/finance-overview";
import { toPiastres, formatMoney } from "@/lib/money";
import { methodLabel, PAYMENT_METHOD_KEYS } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
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

  // المصروفات تُخصم من الربح فقط — لا تمسّ رأس المال
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

  const dateStr = get("date");
  const date = dateStr ? new Date(dateStr) : new Date();

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
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({
      where: { refType: "Expense", refId: id },
    });
    await tx.expense.delete({ where: { id } });
  });
  await audit("DELETE", "Expense", id);
  revalidatePath("/finance");
  revalidatePath("/");
}
