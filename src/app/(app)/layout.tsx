import { AppShell } from "@/components/app-shell";
import { getCurrentProfile, isImpersonating, requireUser } from "@/lib/auth";
import { listFavoriteProjects } from "@/lib/favorites";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [profile, favorites, impersonating] = await Promise.all([
    getCurrentProfile(),
    listFavoriteProjects(user.id),
    isImpersonating(),
  ]);

  const name = profile?.full_name || user.email?.split("@")[0] || "User";
  const role = profile?.role ?? "member";

  return (
    <AppShell
      name={name}
      email={user.email ?? ""}
      role={role}
      favorites={favorites}
      impersonating={impersonating}
    >
      {children}
    </AppShell>
  );
}
