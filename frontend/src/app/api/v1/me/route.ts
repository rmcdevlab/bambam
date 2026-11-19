import { live } from "@/server/platform/http";
import { currentUser } from "@/server/platform/controllers";
export const GET = live(currentUser);
