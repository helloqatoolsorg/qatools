export function safeAuthReturnTo(value: string | null | undefined, origin: string): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (decodedPath.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) return null;
    if (url.origin !== origin || ["/user", "/reset-password"].includes(decodedPath.replace(/\/+$/, ""))) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function authModeLink(mode: "login" | "signup" | "reset", origin: string, currentPath: string): string {
  const current = new URL(currentPath, origin);
  const returnTo = safeAuthReturnTo(current.searchParams.get("returnTo"), origin) ?? safeAuthReturnTo(currentPath, origin);
  const params = new URLSearchParams();
  if (mode !== "login") params.set("mode", mode);
  if (returnTo) params.set("returnTo", returnTo);
  return "/user" + (params.size ? "?" + params.toString() : "");
}
