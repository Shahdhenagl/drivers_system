"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { toPiastres } from "@/lib/money";
import { EXTRA_PROFIT_METHOD, TIP_METHOD } from "@/lib/constants";

function pathFor(partyType: "DRIVER" | "CONTRACTOR", partyId: string) {
  const base = partyType === "DRIVER" ? "/drivers" : "/contractors";
  return { base, profile: `${base}/${partyId}` };
}

/**
 * ربح إضافي من طرف: يُقيَّد على حسابه (يزيد "عليه") ويُضاف لربح المكتب.
 * حركة على الحساب (لا كاش) — تُحصَّل لاحقًا ضمن حسابه. تظهر كرصيد ويمكن تعديلها/حذفها.
 */
export async function recordExtraProfit(
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  await prisma.advance.create({
    data: {
      partyType,
      partyId,
      amount,
      direction: "OUT", // عليه (يدين لنا)
      method: EXTRA_PROFIT_METHOD,
      note: note ?? "ربح إضافي",
      date,
    },
  });
  await audit("EXTRA_PROFIT", partyType === "DRIVER" ? "Driver" : "Contractor", partyId, { amount });
  const p = pathFor(partyType, partyId);
  revalidatePath(p.profile);
  revalidatePath(p.base);
  revalidatePath("/finance");
  revalidatePath("/");
}

/**
 * إكرامية للطرف: تُقيَّد على حسابه (تزيد "له") وتُخصم من ربح المكتب.
 * حركة على الحساب (لا كاش) — تُدفع لاحقًا ضمن حسابه.
 */
export async function recordTip(
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  await prisma.advance.create({
    data: {
      partyType,
      partyId,
      amount,
      direction: "IN", // له (ندين له)
      method: TIP_METHOD,
      note: note ?? "إكرامية",
      date,
    },
  });
  await audit("TIP", partyType === "DRIVER" ? "Driver" : "Contractor", partyId, { amount });
  const p = pathFor(partyType, partyId);
  revalidatePath(p.profile);
  revalidatePath(p.base);
  revalidatePath("/finance");
  revalidatePath("/");
}

/** تعديل قيمة/ملاحظة ربح إضافي أو إكرامية */
export async function editPartyAdjustment(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };
  const adv = await prisma.advance.findUnique({ where: { id } });
  if (!adv) return { error: "الحركة غير موجودة" };
  await prisma.advance.update({ where: { id }, data: { amount, note: note ?? adv.note } });
  const base = adv.partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${adv.partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
  revalidatePath("/");
}

/** حذف ربح إضافي أو إكرامية */
export async function deletePartyAdjustment(id: string) {
  const adv = await prisma.advance.findUnique({ where: { id } });
  if (!adv) return { error: "الحركة غير موجودة" };
  await prisma.advance.delete({ where: { id } });
  const base = adv.partyType === "DRIVER" ? "/drivers" : "/contractors";
  revalidatePath(`${base}/${adv.partyId}`);
  revalidatePath(base);
  revalidatePath("/finance");
  revalidatePath("/");
}
