"use client";

import { useEffect } from "react";
import { playSound } from "@/lib/sounds";

/**
 * يشغّل صوت نقر خفيف عند الضغط على أي زر أو رابط في كل التطبيق.
 * الأصوات المميزة (طلب جديد، تحصيل، إلغاء...) تُشغَّل يدويًا في أماكنها.
 */
export function SoundEffects() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      const el = target?.closest(
        'button, a[href], [role="button"], [role="tab"], [role="option"]'
      );
      if (!el) return;
      if ((el as HTMLButtonElement).disabled) return;
      // نتجاهل زر كتم الصوت — له معالجته الخاصة
      if (el.getAttribute("data-no-click-sound") !== null) return;
      playSound("click");
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
