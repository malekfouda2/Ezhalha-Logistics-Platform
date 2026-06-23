type AppUserType = string;

export function getDefaultAuthenticatedPath(userType: AppUserType): string {
  // Internal staff (admin + operations) share the permission-driven admin
  // shell; ProtectedRoute redirects to the first page their permissions allow.
  if (userType === "admin" || userType === "operations") return "/admin";
  return "/client";
}

export function getPasswordChangePath(userType: AppUserType): string {
  if (userType === "admin" || userType === "operations") return "/admin/settings";
  return "/client/settings";
}

export function getPostLoginPath(user: {
  userType: AppUserType;
  mustChangePassword?: boolean | null;
}): string {
  if (user.mustChangePassword) {
    return getPasswordChangePath(user.userType);
  }

  return getDefaultAuthenticatedPath(user.userType);
}
