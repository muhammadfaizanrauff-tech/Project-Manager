import "server-only";

// Marks a browser as signed in. It used to be a true browser-session cookie (no
// `maxAge`), which is what made `updateSession` force a fresh login every time
// the browser was closed and reopened. That behaviour was dropped on request:
// people want to stay signed in, so the marker now outlives the browser process
// and only disappears on an explicit logout.
//
// It is still set and cleared alongside sign-in/sign-out because the
// impersonation flow (src/app/(app)/impersonate-actions.ts) uses it to tell a
// live session from a stale one when restoring the Admin's own account.
export const ACTIVE_SESSION_COOKIE = "pm_active";

/** A year, matching how long people expect "keep me signed in" to last. The
 *  Supabase auth cookie itself is longer-lived still (400 days, hardcoded by
 *  @supabase/ssr) and is refreshed on every request by the proxy. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const activeSessionCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  maxAge: ONE_YEAR_SECONDS,
};
