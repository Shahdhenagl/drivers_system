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
import { displayPhone, toWhatsAppNumber, whatsAppLink } from "@/lib/phone";
import { waAppLink, WA_PREF_KEY, type WaApp } from "@/lib/whatsapp";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

export function WhatsAppButton({
  phone,
  phones,
  message,
  children,
  variant = "success",
  size = "sm",
  className,
  disabled,
}: {
  phone?: string;
  phones?: Array<string | null | undefined>;
  message: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
  const [choosingPhone, setChoosingPhone] = useState(false);
  const [choosingApp, setChoosingApp] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [remember, setRemember] = useState(false);

  const phoneChoices = uniquePhones(phones?.length ? phones : [phone]);

  function openApp(app: WaApp, targetPhone = selectedPhone) {
    window.location.href = waAppLink(app, targetPhone, message);
  }

  function openWhatsApp(targetPhone: string) {
    if (!targetPhone) return;
    setSelectedPhone(targetPhone);

    const isAndroid =
      typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
    if (!isAndroid) {
      window.open(whatsAppLink(targetPhone, message), "_blank");
      return;
    }

    const pref =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(WA_PREF_KEY)
        : null;
    if (pref === "normal" || pref === "business") {
      openApp(pref, targetPhone);
      return;
    }
    setChoosingApp(true);
  }

  function handleClick() {
    if (disabled || phoneChoices.length === 0) return;
    if (phoneChoices.length > 1) {
      setChoosingPhone(true);
      return;
    }
    openWhatsApp(phoneChoices[0]);
  }

  function choosePhone(targetPhone: string) {
    setChoosingPhone(false);
    openWhatsApp(targetPhone);
  }

  function choose(app: WaApp) {
    if (remember) {
      try {
        localStorage.setItem(WA_PREF_KEY, app);
      } catch {
        // Local storage can be unavailable in private modes.
      }
    }
    setChoosingApp(false);
    openApp(app);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || phoneChoices.length === 0}
        onClick={handleClick}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {children}
      </button>

      <Dialog open={choosingPhone} onOpenChange={setChoosingPhone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختار رقم واتساب</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            {phoneChoices.map((p, i) => (
              <Button
                key={`${toWhatsAppNumber(p)}-${i}`}
                variant="outline"
                size="lg"
                className="w-full justify-between"
                onClick={() => choosePhone(p)}
              >
                <span>{i === 0 ? "الرقم الأساسي" : `رقم إضافي ${i}`}</span>
                <span dir="ltr" className="tabular-nums">
                  {displayPhone(p)}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={choosingApp} onOpenChange={setChoosingApp}>
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

function uniquePhones(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = (item ?? "").trim();
    if (!value) continue;
    const normalized = toWhatsAppNumber(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}
