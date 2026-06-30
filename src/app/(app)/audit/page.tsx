import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { ArrowRight, ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  STATUS: "تغيير حالة",
  COLLECT: "تحصيل",
  COLLECT_VIA_DRIVER: "تحصيل عن طريق السواق",
  DRIVER_PAY: "سداد سواق",
  PAY: "سداد",
  WITHDRAW: "سحب",
  DISTRIBUTE: "توزيع أرباح",
  NOTE: "ملاحظة",
  LOGIN: "دخول",
  LOGOUT: "خروج",
};

const ENTITY_LABEL: Record<string, string> = {
  Trip: "رحلة",
  Contractor: "مقاول",
  Driver: "سواق",
  Partner: "شريك",
  Expense: "مصروف",
  Settlement: "تصفية",
  Session: "جلسة",
};

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <AppHeader title="سجل العمليات" />
      <div className="space-y-4 py-3">
        <Link
          href="/more"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <ScrollText className="h-12 w-12 opacity-40" />
            <p>لا توجد عمليات بعد</p>
          </div>
        ) : (
          <Card className="divide-y divide-border">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <span className="font-semibold">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {ENTITY_LABEL[l.entity] ?? l.entity}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(l.createdAt)}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
