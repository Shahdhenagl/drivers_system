import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";
import {
  Users,
  Truck,
  Handshake,
  FileBarChart,
  ScrollText,
  LogOut,
  ChevronLeft,
} from "lucide-react";

const links = [
  { href: "/contractors", label: "المقاولين", icon: Users, color: "text-primary bg-primary/15" },
  { href: "/drivers", label: "السواقين", icon: Truck, color: "text-warning bg-warning/15" },
  { href: "/partners", label: "الشركاء", icon: Handshake, color: "text-blue-400 bg-blue-500/15" },
  { href: "/reports", label: "التقارير", icon: FileBarChart, color: "text-success bg-success/15" },
  { href: "/audit", label: "سجل العمليات", icon: ScrollText, color: "text-muted-foreground bg-muted" },
];

export default function MorePage() {
  return (
    <>
      <AppHeader title="المزيد" />
      <div className="space-y-4 py-3">
        <div className="space-y-2.5">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Card className="flex items-center gap-3 p-4 active:scale-[0.99] transition-transform">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${l.color}`}
                >
                  <l.icon className="h-5 w-5" />
                </span>
                <span className="flex-1 font-semibold">{l.label}</span>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>

        <form action={logout}>
          <Button variant="outline" size="lg" className="w-full text-destructive">
            <LogOut className="h-5 w-5" /> تسجيل الخروج
          </Button>
        </form>

        <p className="pt-4 text-center text-xs text-muted-foreground">
          مكتب الأصدقاء • الإصدار 1.0
        </p>
      </div>
    </>
  );
}
