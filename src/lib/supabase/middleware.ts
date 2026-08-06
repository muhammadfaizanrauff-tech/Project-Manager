import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_SESSION_COOKIE } from "./session-marker";

const PUBLIC_PATHS = ["/login", "/change-password", "/auth"];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

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

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // The Supabase auth cookie itself is long-lived (400 days, hardcoded by
  // @supabase/ssr) so it survives closing the browser on its own. The
  // `pm_active` marker cookie (set at login, no maxAge) is what actually
  // expires when the browser closes — its absence here means "this is a
  // fresh browser session with a stale-but-valid auth cookie", so force a
  // real logout instead of letting it through.
  if (user && !isPublicPath(request.nextUrl.pathname) && !request.cookies.get(ACTIVE_SESSION_COOKIE)) {
    await supabase.auth.signOut();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    url.searchParams.set("expired", "1");
    const redirectResponse = NextResponse.redirect(url);
    // `signOut()` queued its cookie-clearing headers onto `response` via the
    // `setAll` callback above — carry them over, since NextResponse.redirect
    // creates a brand-new response that wouldn't otherwise include them.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}
