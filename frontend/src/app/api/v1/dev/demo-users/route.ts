import { live } from "@/server/platform/http";
import { demoUsers } from "@/server/platform/controllers";
export const GET = live(demoUsers);
