"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { toPiastres } from "@/lib/money";

type PartyType = "DRIVER" | "CONTRACTOR";

function isPartyType(value: string): value is PartyType {
  return value === "DRIVER" || value === "CONTRACTOR";
}

async function partyName(type: PartyType, id: string) {
  if (type === "DRIVER") {
    const d = await prisma.driver.findUnique({
      where: { id },
      select: { name: true },
    });
    return d?.name ?? null;
  }
  const c = await prisma.contractor.findUnique({
    where: { id },
    select: { name: true },
  });
  return c?.name ?? null;
}

function profilePath(type: string, id: string) {
  return type === "DRIVER" ? `/drivers/${id}` : `/contractors/${id}`;
}

function listPath(type: string) {
  return type === "DRIVER" ? "/drivers" : "/contractors";
}

async function revalidateParties(rows: Array<{ type: string; id: string }>) {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.type}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    revalidatePath(profilePath(row.type, row.id));
    revalidatePath(listPath(row.type));
  }
}

function readParty(fd: FormData, prefix: "borrower" | "lender") {
  const type = String(fd.get(`${prefix}Type`) ?? "");
  const id = String(fd.get(`${prefix}Id`) ?? "");
  if (!isPartyType(type) || !id) return null;
  return { type, id };
}

export async function addExternalAdvance(formData: FormData) {
  const borrower = readParty(formData, "borrower");
  const lender = readParty(formData, "lender");
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!borrower || !lender) return { error: "اختار الطرفين بشكل صحيح" };
  if (borrower.type === lender.type && borrower.id === lender.id) {
    return { error: "لا يمكن الطرف يستلف من نفسه" };
  }
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const [borrowerName, lenderName] = await Promise.all([
    partyName(borrower.type, borrower.id),
    partyName(lender.type, lender.id),
  ]);
  if (!borrowerName || !lenderName) return { error: "أحد الأطراف غير موجود" };

  const row = await prisma.externalAdvance.create({
    data: {
      borrowerType: borrower.type,
      borrowerId: borrower.id,
      borrowerName,
      lenderType: lender.type,
      lenderId: lender.id,
      lenderName,
      amount,
      date,
      note,
    },
  });

  await audit("CREATE", "ExternalAdvance", row.id, {
    amount,
    borrower,
    lender,
  });
  await revalidateParties([
    { type: borrower.type, id: borrower.id },
    { type: lender.type, id: lender.id },
  ]);
}

export async function editExternalAdvance(id: string, formData: FormData) {
  const current = await prisma.externalAdvance.findUnique({ where: { id } });
  if (!current) return { error: "السلفة الخارجية غير موجودة" };

  const borrower = readParty(formData, "borrower");
  const lender = readParty(formData, "lender");
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!borrower || !lender) return { error: "اختار الطرفين بشكل صحيح" };
  if (borrower.type === lender.type && borrower.id === lender.id) {
    return { error: "لا يمكن الطرف يستلف من نفسه" };
  }
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const [borrowerName, lenderName] = await Promise.all([
    partyName(borrower.type, borrower.id),
    partyName(lender.type, lender.id),
  ]);
  if (!borrowerName || !lenderName) return { error: "أحد الأطراف غير موجود" };

  await prisma.externalAdvance.update({
    where: { id },
    data: {
      borrowerType: borrower.type,
      borrowerId: borrower.id,
      borrowerName,
      lenderType: lender.type,
      lenderId: lender.id,
      lenderName,
      amount,
      date,
      note,
    },
  });

  await audit("EDIT", "ExternalAdvance", id, { amount, borrower, lender });
  await revalidateParties([
    { type: current.borrowerType, id: current.borrowerId },
    { type: current.lenderType, id: current.lenderId },
    { type: borrower.type, id: borrower.id },
    { type: lender.type, id: lender.id },
  ]);
}

export async function settleExternalAdvance(id: string) {
  const current = await prisma.externalAdvance.findUnique({ where: { id } });
  if (!current) return { error: "السلفة الخارجية غير موجودة" };

  await prisma.externalAdvance.update({
    where: { id },
    data: { status: "SETTLED", settledAt: new Date() },
  });

  await audit("SETTLE", "ExternalAdvance", id);
  await revalidateParties([
    { type: current.borrowerType, id: current.borrowerId },
    { type: current.lenderType, id: current.lenderId },
  ]);
}

export async function reopenExternalAdvance(id: string) {
  const current = await prisma.externalAdvance.findUnique({ where: { id } });
  if (!current) return { error: "السلفة الخارجية غير موجودة" };

  await prisma.externalAdvance.update({
    where: { id },
    data: { status: "OPEN", settledAt: null },
  });

  await audit("REOPEN", "ExternalAdvance", id);
  await revalidateParties([
    { type: current.borrowerType, id: current.borrowerId },
    { type: current.lenderType, id: current.lenderId },
  ]);
}

export async function deleteExternalAdvance(id: string) {
  const current = await prisma.externalAdvance.findUnique({ where: { id } });
  if (!current) return { error: "السلفة الخارجية غير موجودة" };

  await prisma.externalAdvance.delete({ where: { id } });
  await audit("DELETE", "ExternalAdvance", id, { amount: current.amount });
  await revalidateParties([
    { type: current.borrowerType, id: current.borrowerId },
    { type: current.lenderType, id: current.lenderId },
  ]);
}
