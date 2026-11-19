import { login } from "@/server/platform/auth";
import { endpoint, live } from "@/server/platform/http";
export const GET = live(endpoint(login));
