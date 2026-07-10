import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recovery?: string }>;
}) {
  const { recovery } = await searchParams;
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <Card className="w-full max-w-sm gap-6 rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo />
            <p className="mt-1 text-sm text-muted-foreground">
              Change your password
            </p>
          </div>

          <ChangePasswordForm
            initialEmail={user?.email ?? undefined}
            loggedIn={Boolean(user)}
            skipToNew={recovery === "1"}
          />
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}
