"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteTrip } from "../actions";

export function DeleteTripButton({
  id,
  canDelete,
}: {
  id: string;
  canDelete: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!canDelete) {
      alert("تم التحصيل على هذه الرحلة — تظل محفوظة ولا يمكن حذفها");
      return;
    }
    if (!confirm("حذف هذا الطلب وكل بياناته نهائيًا؟")) return;
    setLoading(true);
    try {
      const res = await deleteTrip(id);
      if (res?.error) {
        alert(res.error);
        setLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("NEXT_REDIRECT")) {
        alert("تعذّر الحذف");
        setLoading(false);
      }
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-destructive print:hidden"
      onClick={handle}
      disabled={loading || !canDelete}
      aria-label="حذف الطلب"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      حذف الطلب
    </Button>
  );
}
