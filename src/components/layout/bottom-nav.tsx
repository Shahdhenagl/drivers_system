"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ClipboardList, Wallet, Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/trips", label: "الطلبات", icon: ClipboardList },
  { href: "/finance", label: "الماليات", icon: Wallet },
  { href: "/more", label: "المزيد", icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur safe-bottom">
      <div className="relative mx-auto grid max-w-lg grid-cols-5 items-center px-2">
        {items.slice(0, 2).map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}

        {/* FAB في المنتصف */}
        <div className="flex justify-center">
          <button
            onClick={() => router.push("/trips/new")}
            aria-label="طلب جديد"
            className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>

        {items.slice(2).map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
