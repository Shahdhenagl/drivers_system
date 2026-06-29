import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    primary: "text-primary",
  }[tone];

  const iconBg = {
    default: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
  }[tone];

  const inner = (
    <Card className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              iconBg
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className={cn("text-xl font-bold tabular-nums", toneClass)}>
        {value}
      </div>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </Card>
  );

  return href ? (
    <Link href={href} className="block active:scale-[0.98] transition-transform">
      {inner}
    </Link>
  ) : (
    inner
  );
}
