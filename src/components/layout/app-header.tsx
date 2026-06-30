"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sounds";

export function AppHeader({ title }: { title: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setMounted(true);
    setSound(isSoundEnabled());
    const onToggle = (e: Event) =>
      setSound((e as CustomEvent<boolean>).detail);
    window.addEventListener("sound-toggle", onToggle);
    return () => window.removeEventListener("sound-toggle", onToggle);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <h1 className="text-lg font-bold">{title}</h1>
        <div className="flex items-center gap-1">
          <button
            aria-label={sound ? "كتم الصوت" : "تشغيل الصوت"}
            data-no-click-sound
            onClick={() => setSoundEnabled(!sound)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            {mounted && sound ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </button>
          <button
            aria-label="تبديل الوضع"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            {mounted && theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
