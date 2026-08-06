import "server-only";

// A plain, JS-writable cookie with NO `maxAge`/`expires` — a true browser-session
// cookie per spec, cleared by the browser only when the whole process closes (not
// just the tab). The real Supabase auth cookie is long-lived (400 days, hardcoded by
// @supabase/ssr) so it survives a browser restart on its own; this marker is what lets
// `updateSession` (src/lib/supabase/middleware.ts) detect "browser was closed and
// reopened" and force a fresh login, per the product's "log out on browser close"
// requirement.
export const ACTIVE_SESSION_COOKIE = "pm_active";

export const activeSessionCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
};
