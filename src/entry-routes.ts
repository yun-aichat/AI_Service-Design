export type EntryPage = "account" | "admin" | "billing" | "roundtable" | "app";

export function normalizeEntryPath(pathname: string) {
  const normalized = pathname.trim().replace(/\/+$/, "") || "/";
  return normalized.toLowerCase();
}

export function resolveEntryPage(pathname: string): EntryPage {
  const path = normalizeEntryPath(pathname);

  if (path === "/account") return "account";
  if (path.startsWith("/admin")) return "admin";
  if (path === "/billing" || path === "/account/billing") return "billing";
  if (path === "/roundtable") return "roundtable";
  return "app";
}
