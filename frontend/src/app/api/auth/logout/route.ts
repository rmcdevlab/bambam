import { logout } from "@/server/platform/auth";
import { endpoint, live } from "@/server/platform/http";
export const POST = live(endpoint(logout));
