"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { collectorNameFromMethod } from "@/lib/constants";

const COL_MARKER = /\[c:col:([^\]]+)\]/;
const LEGACY_LUMP = "تحصيل مجمّع عن طريق";

/**
 * تصحيح سلف المحصّلين اليتيمة: حركات "المحصّل يمسك الفلوس" (سلفة عليه) اتفضلت
 * بعد حذف تحصيلاتها المصدر — فتضخّم "ما لنا" ورأس المال بغير وجه حق.
 *
 * نوعان:
 * 1) حركات مربوطة بعلامة [c:col:<id>] لتحصيل لم يعد موجودًا → تُحذف.
 * 2) حركات "تحصيل مجمّع عن طريق X" القديمة (بدون علامة) → نطابقها بالتحصيلات
 *    الباقية بنفس الطريقة والتاريخ؛ لو اتحذفت كلها تُحذف الحركة، ولو اتحذف جزء
 *    تُخفَّض قيمتها للباقي فعليًا.
 */
export async function repairOrphanCollectorHoldings(): Promise<{
  removed: number;
  reduced: number;
  freedAmount: number;
}> {
  const advances = await prisma.advance.findMany({
    where: { direction: "OUT", partyType: "DRIVER" },
  });

  let removed = 0;
  let reduced = 0;
  let freedAmount = 0;

  for (const a of advances) {
    // نتعامل فقط مع سلف المحصّلين ("عن طريق <اسم>")
    if (!collectorNameFromMethod(a.method)) continue;

    const markerMatch = a.note?.match(COL_MARKER);
    if (markerMatch) {
      const colId = markerMatch[1];
      const col = await prisma.collection.findUnique({ where: { id: colId } });
      if (!col) {
        await prisma.advance.delete({ where: { id: a.id } });
        removed += 1;
        freedAmount += a.amount;
      }
      continue;
    }

    // النمط القديم: "تحصيل مجمّع عن طريق X" بدون علامة ربط
    if (a.note && a.note.includes(LEGACY_LUMP)) {
      const matched = await prisma.collection.aggregate({
        where: { method: a.method, date: a.date },
        _sum: { amount: true },
      });
      const surviving = matched._sum.amount ?? 0;
      if (surviving <= 0) {
        await prisma.advance.delete({ where: { id: a.id } });
        removed += 1;
        freedAmount += a.amount;
      } else if (surviving < a.amount) {
        freedAmount += a.amount - surviving;
        await prisma.advance.update({
          where: { id: a.id },
          data: { amount: surviving },
        });
        reduced += 1;
      }
    }
  }

  if (removed > 0 || reduced > 0) {
    await audit("REPAIR", "Advance", "collector-holdings", {
      removed,
      reduced,
      freedAmount,
    });
    revalidatePath("/finance");
    revalidatePath("/drivers");
    revalidatePath("/contractors");
    revalidatePath("/");
  }

  return { removed, reduced, freedAmount };
}
