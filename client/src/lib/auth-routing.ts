type AppUserType = string;

export function getDefaultAuthenticatedPath(userType: AppUserType): string {
  return userType === "admin" ? "/admin" : "/client";
}

export function getPasswordChangePath(userType: AppUserType): string {
  return userType === "admin" ? "/admin/settings" : "/client/settings";
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
