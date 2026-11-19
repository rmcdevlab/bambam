import "server-only";
// Public route surface retained from the approved API contracts. Dynamic values stay one segment.
const repair = [
 "GET categories", "GET buildings", "GET me/recent-places", "POST photos", "GET photos/:id",
 "POST tickets", "GET tickets", "GET tickets/counts", "GET tickets/mine", "GET tickets/duplicates", "GET tickets/:id",
 ...["assess","resolve","confirm","send-back","close","follow","handover"].map(action=>`POST tickets/:id/${action}`),
 "GET technicians", "GET contractor-types", "POST contractor-types", "GET contractors", "POST contractors", "GET contractors/:id", "PUT contractors/:id", "GET contractors/:id/jobs",
 "GET admin/overview", "GET asset-types", "GET floors/:id/plan", "GET floors/:id/room-plan", "GET assets/suggest-code", "POST assets", "PUT assets/:id", "POST assets/:id/deactivate", "GET assets/:code",
];
const settings = [
 "GET roles", "POST roles", "PATCH roles/:id", "DELETE roles/:id", "GET permissions", "PUT permissions", "GET users", "GET users/:id", "PUT users/:id/role", "GET audit", "GET audit/actors",
 "GET buildings", "PATCH buildings/:id", "PATCH rooms/:id", "GET rooms/:id/assets", "GET building-types", "POST building-types", "PATCH building-types/:id",
 "GET assets/labels", "POST assets/labels/printed", "GET assets/suggest-code", "POST assets", "PATCH assets/:id", "GET asset-types", "POST asset-types", "PATCH asset-types/:id",
 "GET categories", "POST categories", "PATCH categories/:id", "DELETE categories/:id", "PUT categories/order", "GET categories/:id/symptoms", "POST categories/:id/symptoms", "PUT categories/:id/symptoms/order", "PATCH symptoms/:id", "DELETE symptoms/:id",
 "GET contractor-types", "POST contractor-types", "PATCH contractor-types/:id", "DELETE contractor-types/:id",
];
export function matchesRoute(moduleKey:string,method:string,path:string[]) {
 const routes=moduleKey==="repair"?repair:moduleKey==="settings"?settings:[];
 return routes.some(route=>{
 const [verb,pattern]=route.split(" "),segments=pattern.split("/");
 return verb===method&&segments.length===path.length&&segments.every((s,i)=>s.startsWith(":")?!!path[i]:s===path[i]);
 });
}
