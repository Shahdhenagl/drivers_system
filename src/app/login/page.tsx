import { redirect } from "next/navigation";
import { isAuthenticated, setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPANY_NAME } from "@/lib/constants";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD || "admin123";
  if (password !== expected) {
    redirect("/login?error=1");
  }
  await setSession();
  await prisma.auditLog.create({
    data: { action: "LOGIN", entity: "Session", actor: "admin" },
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={COMPANY_NAME}
            className="h-40 w-40 object-contain"
          />
          <p className="text-sm text-muted-foreground">
            لإدارة النقل — تسجيل دخول المدير للمتابعة
          </p>
        </div>

        <form action={login} className="space-y-4">
          <div className="space-y-2">
            <Input
              name="password"
              type="password"
              inputMode="text"
              placeholder="كلمة المرور"
              autoFocus
              required
              className="text-center"
            />
            {error && (
              <p className="text-center text-sm text-destructive">
                كلمة المرور غير صحيحة
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full">
            دخول
          </Button>
        </form>
      </div>
    </div>
  );
}
