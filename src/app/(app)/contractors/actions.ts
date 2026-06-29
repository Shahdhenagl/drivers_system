"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function createContractor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  const c = await prisma.contractor.create({
    data: {
      name,
      phone,
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
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Contractor", id);
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${id}`);
}

export async function deleteContractor(id: string) {
  const tripCount = await prisma.trip.count({ where: { contractorId: id } });
  if (tripCount > 0) {
    throw new Error("لا يمكن حذف مقاول لديه رحلات");
  }
  await prisma.contractor.delete({ where: { id } });
  await audit("DELETE", "Contractor", id);
  revalidatePath("/contractors");
  redirect("/contractors");
}
