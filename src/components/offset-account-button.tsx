"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Scale, Loader2 } from "lucide-react";
import { offsetAccount } from "@/lib/offset-actions";
import { playSound } from "@/lib/sounds";

export function OffsetAccountButton({
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
        "مقاصّة الحساب: يقاصّ اللي له مع اللي عليه بدون أي كاش ويصفّر المتساوي (يفضل كسجل). متأكد؟"
      )
    )
      return;
    setLoading(true);
    try {
      const res = await offsetAccount(partyType, partyId);
      if (res?.error) {
        playSound("error");
        alert(res.error);
        return;
      }
      playSound("money");
      router.refresh();
    } catch {
      playSound("error");
      alert("تعذّرت المقاصّة");
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
        <Scale className="h-5 w-5" />
      )}
      مقاصّة / تصفية الحساب
    </Button>
  );
}
