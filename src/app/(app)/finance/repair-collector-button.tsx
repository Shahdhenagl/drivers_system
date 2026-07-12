"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { repairOrphanCollectorHoldings } from "@/lib/maintenance-actions";
import { playSound } from "@/lib/sounds";
import { formatMoney } from "@/lib/money";
import { Wrench, Loader2 } from "lucide-react";

/**
 * زر صيانة: يمسح سلف المحصّلين اليتيمة (تحصيلات محذوفة فضلت سلفتها على المحصّل)
 * فيصحّح "ما لنا" ورأس المال. آمن — لا يمسّ إلا الحركات التي فقدت مصدرها.
 */
export function RepairCollectorButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onRun() {
    if (
      !confirm(
        "تصحيح سلف المحصّلين اليتيمة (الناتجة عن تحصيلات محذوفة)؟ لن تُمسّ إلا الحركات التي لم يعد لها تحصيل."
      )
    )
      return;
    setLoading(true);
    try {
      const res = await repairOrphanCollectorHoldings();
      if (res.removed === 0 && res.reduced === 0) {
        playSound("cancel");
        alert("لا توجد حركات يتيمة — كله سليم.");
      } else {
        playSound("success");
        alert(
          `تم التصحيح: حذف ${res.removed} حركة، تخفيض ${res.reduced}، وتحرير ${formatMoney(
            res.freedAmount
          )} من رأس المال.`
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
      تصحيح سلف المحصّلين اليتيمة
    </Button>
  );
}
