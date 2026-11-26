// Server environment only. This flag must never be a NEXT_PUBLIC variable.
export function isAok(source: Record<string, string | undefined> = process.env): boolean {
  const value = source.is_aok;
  if (value !== undefined && value !== "true" && value !== "false") throw new Error("Invalid is_aok");
  if (value !== "true") return false;
  if (source.APP_ENV !== "development") throw new Error("is_aok requires APP_ENV=development");
  if (source.NEXT_PUBLIC_USE_MOCKS === "true") throw new Error("is_aok cannot use mocks");
  return true;
}

export function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
