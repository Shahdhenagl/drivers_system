import { prisma } from "@/lib/prisma";

export async function audit(
  action: string,
  entity: string,
  entityId?: string,
  details?: unknown
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        details: details ? JSON.stringify(details) : null,
        actor: "admin",
      },
    });
  } catch {
    // لا توقف العملية بسبب فشل التدقيق
  }
}
