import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-lg px-4 pb-28 pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}
