// Next Link/router prefix routes automatically; browser URLs and assets need this helper.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function appPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`))) return path;
  return `${basePath}${path}`;
}

export function stripBasePath(path: string): string {
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`))) {
    return path.slice(basePath.length) || "/";
  }
  return path;
}
