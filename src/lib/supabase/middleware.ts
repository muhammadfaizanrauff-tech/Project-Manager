import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_SESSION_COOKIE, activeSessionCookieOptions } from "./session-marker";

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

  // A signed-in session is deliberately left alone from here on. This used to
  // check for the `pm_active` marker cookie and force a logout when it was
  // missing, which is what signed people out every time they closed the
  // browser; that requirement was dropped. `getUser()` above already refreshed
  // the Supabase tokens on this request, so an open session keeps renewing
  // itself for as long as it's used and only ends at an explicit sign-out.
  //
  // Anyone still holding the old session-only marker gets it re-issued with a
  // proper expiry, so the change takes effect without a round trip through the
  // login page.
  if (user && !request.cookies.get(ACTIVE_SESSION_COOKIE)) {
    response.cookies.set(ACTIVE_SESSION_COOKIE, "1", activeSessionCookieOptions);
  }

  return response;
}
