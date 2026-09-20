// Where to land a signed-in user, based on their account type. `userType` comes straight off
// `SafeUser` (shared/schema.ts `users.userType`) — "admin", "operations", or "client".
export function getHomeRouteForUserType(userType: string | undefined): string {
  if (userType === "admin") {
    return "/(protected)/(admin)/(tabs)/";
  }
  return "/(protected)/(client)/(tabs)/";
}
