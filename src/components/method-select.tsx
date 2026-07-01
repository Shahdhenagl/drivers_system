"use client";

import { useState } from "react";
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
        </SelectContent>
      </Select>
    </>
  );
}
