"use client";

import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

export function PrintButton({ label = "تصدير PDF" }: { label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <FileDown className="h-4 w-4" />
      {label}
    </Button>
  );
}
