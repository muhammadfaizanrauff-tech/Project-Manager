import { LogoFull } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
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
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="gradient-mesh pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <FadeIn y={16}>
          <Card className="gradient-border w-full max-w-sm gap-6 rounded-2xl p-8 shadow-lg">
            <div className="flex flex-col items-center gap-1 text-center">
              <LogoFull width={150} />
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
        </FadeIn>
      </main>

      <SiteFooter className="relative z-10" />
    </div>
  );
}
