import "server-only";
export type ErrorKind = "invalid" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "business_rule" | "internal";
// Services return domain errors; only the HTTP adapter maps them to status codes.
export class ApiError extends Error {
  constructor(public kind: ErrorKind, public code: string, message: string, public fields?: Record<string, string>, public details?: unknown) { super(message); }
}
export const unauthenticated = () => new ApiError("unauthenticated", "UNAUTHENTICATED", "no or expired session");
