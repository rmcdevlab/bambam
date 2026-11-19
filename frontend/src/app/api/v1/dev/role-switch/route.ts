import { live } from "@/server/platform/http";
import { roleSwitch } from "@/server/platform/controllers";
export const POST = live(roleSwitch);
