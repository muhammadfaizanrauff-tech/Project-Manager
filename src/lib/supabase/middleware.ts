import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptPassword } from "@/lib/crypto";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await autoSignIn(supabase);
  }

  return response;
}

// This app has no login wall — every visitor is transparently signed in as
// the sole admin account, decrypting the same stored credential the Admin
// panel uses for its "reveal password" feature. RLS and per-user attribution
// (created_by, manager_id, etc.) keep working normally since a real
// Supabase Auth session still backs every request.
async function autoSignIn(
  supabase: ReturnType<typeof createServerClient>,
) {
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!profile) return;

  const [{ data: authUser }, { data: credentials }] = await Promise.all([
    service.auth.admin.getUserById(profile.id),
    service
      .from("credentials")
      .select("encrypted_password")
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);
  if (!authUser?.user?.email || !credentials) return;

  await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password: decryptPassword(credentials.encrypted_password),
  });
}
