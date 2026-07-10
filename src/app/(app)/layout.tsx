import { AppShell } from "@/components/app-shell";
import { getCurrentProfile, requireUser } from "@/lib/auth";
import { listFavoriteProjects } from "@/lib/favorites";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [profile, favorites] = await Promise.all([
    getCurrentProfile(),
    listFavoriteProjects(user.id),
  ]);

  const name = profile?.full_name || user.email?.split("@")[0] || "User";
  const role = profile?.role ?? "member";

  return (
    <AppShell name={name} email={user.email ?? ""} role={role} userId={user.id} favorites={favorites}>
      {children}
    </AppShell>
  );
}
