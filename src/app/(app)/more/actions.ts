"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function logout() {
  await audit("LOGOUT", "Session");
  await clearSession();
  redirect("/login");
}
