import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  created_at: string;
};

export async function listManagedUsers(scope: "admin" | "manager"): Promise<ManagedUser[]> {
  const supabase = await createClient();
  const service = createServiceClient();

  const query = supabase.from("profiles").select("id, full_name, role, created_at");
  // Managers can see (read-only) other managers too, per the cross-manager
  // visibility model — but never the Admin.
  const { data: profiles } =
    scope === "manager" ? await query.in("role", ["member", "manager"]) : await query;

  if (!profiles || profiles.length === 0) return [];

  const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authList?.users.map((u) => [u.id, u.email ?? ""]));

  return profiles
    .map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? "",
      full_name: p.full_name,
      role: p.role as ManagedUser["role"],
      created_at: p.created_at,
    }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}
