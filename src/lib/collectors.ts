import { prisma } from "@/lib/prisma";
import { collectorNameFromMethod } from "@/lib/constants";

export type Collector = { id: string; name: string };

/**
 * لو الطريقة تخص محصّلًا ("عن طريق <اسم>") يرجّع سجل السواق المطابق.
 * - null: الطريقة عادية (مش محصّل).
 * - { notFound: name }: طريقة محصّل لكن السواق مش موجود بالاسم.
 */
export async function resolveCollector(
  method: string
): Promise<Collector | { notFound: string } | null> {
  const name = collectorNameFromMethod(method);
  if (!name) return null;
  const driver = await prisma.driver.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
  return driver ?? { notFound: name };
}
