"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, assertSpendable } from "@/lib/finance";
import { toPiastres } from "@/lib/money";
import { sendTelegram } from "@/lib/telegram";
import { adminExpenseMessage } from "@/lib/messages";

export async function addExpense(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const amount = toPiastres(get("amount") || "0");
  const method = get("method") || "cash";
  const name = get("name");
  if (!name || amount <= 0) throw new Error("بيانات غير صحيحة");

  // قاعدة: لا يُصرف أكثر من المتاح مع الحفاظ على رأس المال في الكاش
  await assertSpendable(method, amount);

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
    await recordLedger(tx, {
      type: "EXPENSE",
      direction: "OUT",
      amount,
      method,
      description: `مصروف — ${name}`,
      refType: "Expense",
      refId: exp.id,
      date,
    });
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
