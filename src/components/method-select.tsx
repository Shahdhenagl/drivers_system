"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  COLLECTORS,
  collectorMethodValue,
} from "@/lib/constants";

export function MethodSelect({
  name = "method",
  defaultValue = "cash",
  withCollectors = false,
}: {
  name?: string;
  defaultValue?: string;
  withCollectors?: boolean; // يضيف "عن طريق <محصّل>" (للتحصيلات والمصروفات)
}) {
  // مضبوط + hidden input لضمان إرسال القيمة الافتراضية مع الفورم بدون اختيار يدوي
  // (Radix Select لا يُرسل defaultValue بثبات في نماذج Server Actions).
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder="طريقة الدفع" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHOD_KEYS.map((m) => (
            <SelectItem key={m} value={m}>
              {PAYMENT_METHODS[m]}
            </SelectItem>
          ))}
          {withCollectors &&
            COLLECTORS.map((c) => (
              <SelectItem key={c} value={collectorMethodValue(c)}>
                عن طريق {c}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </>
  );
}
