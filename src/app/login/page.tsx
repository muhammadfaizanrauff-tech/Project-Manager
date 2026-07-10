import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="gradient-mesh pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <FadeIn y={16}>
          <Card className="gradient-border w-full max-w-sm gap-6 rounded-2xl p-8 shadow-lg">
            <div className="flex flex-col items-center gap-2 text-center">
              <Logo />
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your workspace
              </p>
            </div>

            <LoginForm next={next ?? "/dashboard"} />

            <p className="text-center text-xs text-muted-foreground">
              Accounts are provisioned by your Admin or Manager — there&apos;s
              no public sign-up.
            </p>
          </Card>
        </FadeIn>
      </main>

      <SiteFooter className="relative z-10" />
    </div>
  );
}
