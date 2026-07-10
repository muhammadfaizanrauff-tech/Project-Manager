import { SiteFooter } from "@/components/site-footer";
import { TopNav } from "@/components/top-nav";
import { getCurrentProfile, requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  const name = profile?.full_name || user.email?.split("@")[0] || "User";
  const role = profile?.role ?? "member";

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav name={name} email={user.email ?? ""} role={role} />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
