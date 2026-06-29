import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { TripForm } from "./trip-form";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const [contractors, drivers] = await Promise.all([
    prisma.contractor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
  ]);

  return (
    <>
      <AppHeader title="طلب جديد" />
      <div className="space-y-4 py-3">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
        <TripForm contractors={contractors} drivers={drivers} />
      </div>
    </>
  );
}
