"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { whatsAppLink } from "@/lib/phone";
import { waAppLink, WA_PREF_KEY, type WaApp } from "@/lib/whatsapp";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

/**
 * زر واتساب يخيّر بين التطبيق العادي والبزنس.
 * على أندرويد يفتح تطبيق واتساب المحدد؛ على غيره يفتح wa.me مباشرة.
 * يمكن حفظ اختيار افتراضي حتى لا يسأل كل مرة.
 */
export function WhatsAppButton({
  phone,
  message,
  children,
  variant = "success",
  size = "sm",
  className,
  disabled,
}: {
  phone: string;
  message: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const [remember, setRemember] = useState(false);

  function openApp(app: WaApp) {
    window.location.href = waAppLink(app, phone, message);
  }

  function handleClick() {
    if (disabled) return;
    const isAndroid =
      typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
    // خارج أندرويد: افتح wa.me مباشرة (تحديد التطبيق غير متاح)
    if (!isAndroid) {
      window.open(whatsAppLink(phone, message), "_blank");
      return;
    }
    const pref =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(WA_PREF_KEY)
        : null;
    if (pref === "normal" || pref === "business") {
      openApp(pref);
      return;
    }
    setChoosing(true);
  }

  function choose(app: WaApp) {
    if (remember) {
      try {
        localStorage.setItem(WA_PREF_KEY, app);
      } catch {
        // تجاهل لو التخزين غير متاح
      }
    }
    setChoosing(false);
    openApp(app);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {children}
      </button>

      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تفتح واتساب بأنهي تطبيق؟</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="success" size="lg" onClick={() => choose("normal")}>
              واتساب عادي
            </Button>
            <Button
              variant="success"
              size="lg"
              onClick={() => choose("business")}
            >
              واتساب بزنس
            </Button>
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-success"
            />
            خليه الافتراضي وما تسألش تاني (تقدر تغيّره من صفحة «المزيد»)
          </label>
        </DialogContent>
      </Dialog>
    </>
  );
}
