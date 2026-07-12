"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { repairOrphanCollectorHoldings } from "@/lib/maintenance-actions";
import { playSound } from "@/lib/sounds";
import { formatMoney } from "@/lib/money";
import { Wrench, Loader2 } from "lucide-react";

/**
 * زر صيانة: يطابق أرصدة المحصّلين مع تحصيلاتهم الفعلية — يزيل السلف الزائدة
 * ويعيد الناقصة، فيصحّح "ما لنا" ورأس المال. آمن ومتكرر.
 */
export function RepairCollectorButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onRun() {
    if (
      !confirm(
        "مطابقة أرصدة المحصّلين مع تحصيلاتهم الفعلية؟ يزيل السلف الزائدة ويعيد الناقصة حتى يتطابق الطرفان."
      )
    )
      return;
    setLoading(true);
    try {
      const res = await repairOrphanCollectorHoldings();
      if (res.collectorsFixed === 0) {
        playSound("cancel");
        alert("أرصدة المحصّلين مطابقة للتحصيلات — كله سليم.");
      } else {
        playSound("success");
        alert(
          `تمت مطابقة ${res.collectorsFixed} محصّل.\n` +
            `أُزيل سلف زائدة: ${formatMoney(res.removedHoldings)}\n` +
            `أُعيد سلف ناقصة: ${formatMoney(res.addedHoldings)}`
        );
      }
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذّر التصحيح");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRun}
      disabled={loading}
      className="w-full print:hidden"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wrench className="h-4 w-4" />
      )}
      مطابقة أرصدة المحصّلين
    </Button>
  );
}
