import "server-only";
import { ApiError } from "./errors";
// Catalog order matches the live Go registry (CR-006), including editable settings keys.
export const permissionKeys = [
  "repair.ticket.report", "repair.ticket.view_all", "repair.ticket.work", "repair.ticket.close_any",
  "repair.ticket.team_handle", "repair.ticket.handover_any", "repair.contractor.manage",
  "repair.overview.view", "repair.building3d.view", "car_booking.use", "room_booking.use",
  "settings.locations.manage", "settings.assets.manage", "settings.categories.manage",
  "settings.contractor_types.manage", "settings.users.view", "settings.users.manage",
  "settings.roles.manage", "settings.audit.view",
] as const;
export function effectivePermissions(role: string, stored: string[]): string[] {
  return permissionKeys.filter(key => role === "super_admin" || stored.includes(key));
}

export function requirePermission(permissions: string[], ...required: string[]) {
  if (!required.some(key => permissions.includes(key))) throw new ApiError("forbidden", "FORBIDDEN", "not allowed");
}
