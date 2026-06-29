"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteExpense } from "./actions";

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      aria-label="حذف"
      onClick={async () => {
        if (!confirm("حذف هذا المصروف؟")) return;
        await deleteExpense(id);
        router.refresh();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
