import { AppShell } from "@/components/app-shell";
import { getCurrentProfile, isImpersonating, requireUser } from "@/lib/auth";
import { listFavoriteProjects } from "@/lib/favorites";
import { countUnreadNotifications } from "@/lib/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [profile, favorites, impersonating, unreadCount] = await Promise.all([
    getCurrentProfile(),
    listFavoriteProjects(user.id),
    isImpersonating(),
    countUnreadNotifications(),
  ]);

  const name = profile?.full_name || user.email?.split("@")[0] || "User";
  const role = profile?.role ?? "member";

  return (
    <AppShell
      name={name}
      email={user.email ?? ""}
      role={role}
      userId={user.id}
      favorites={favorites}
      impersonating={impersonating}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
