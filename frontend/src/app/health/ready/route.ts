import { ready } from "@/server/platform/controllers";
import { endpoint, live } from "@/server/platform/http";
export const GET = live(endpoint(ready));
