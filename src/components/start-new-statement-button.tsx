"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eraser, Loader2 } from "lucide-react";
import { startNewStatement } from "@/lib/offset-actions";
import { playSound } from "@/lib/sounds";

/**
 * زر "بدء حساب جديد" — يظهر لما يتساوى له وعليه (الحساب متعادل).
 * يصفّر عرض الكشف فقط (أرشفة)، والبيانات والربح يفضلوا محفوظين وشغّالين عادي.
 */
export function StartNewStatementButton({
  partyType,
  partyId,
}: {
  partyType: "DRIVER" | "CONTRACTOR";
  partyId: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run() {
    if (
      !confirm(
        "بدء حساب جديد: هيتصفّر كشف الحساب على الشاشة ونبدأ من صفر. البيانات كلها تفضل محفوظة والربح بيتحسب عادي. متأكد؟"
      )
    )
      return;
    setLoading(true);
    try {
      const res = await startNewStatement(partyType, partyId);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("success");
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذّر بدء حساب جديد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      onClick={run}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Eraser className="h-5 w-5" />
      )}
      بدء حساب جديد (تصفير الكشف)
    </Button>
  );
}
