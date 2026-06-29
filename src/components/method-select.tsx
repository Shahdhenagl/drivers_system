"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS, PAYMENT_METHOD_KEYS } from "@/lib/constants";

export function MethodSelect({
  name = "method",
  defaultValue = "cash",
}: {
  name?: string;
  defaultValue?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger>
        <SelectValue placeholder="طريقة الدفع" />
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_METHOD_KEYS.map((m) => (
          <SelectItem key={m} value={m}>
            {PAYMENT_METHODS[m]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
