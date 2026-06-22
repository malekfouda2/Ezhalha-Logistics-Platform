type AppUserType = string;

export function getDefaultAuthenticatedPath(userType: AppUserType): string {
  if (userType === "admin") return "/admin";
  if (userType === "operations") return "/operations";
  return "/client";
}

export function getPasswordChangePath(userType: AppUserType): string {
  if (userType === "admin") return "/admin/settings";
  if (userType === "operations") return "/operations/settings";
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
