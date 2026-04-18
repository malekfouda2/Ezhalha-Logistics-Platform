import { describe, expect, it } from "vitest";
import { ADMIN_ROUTE_PERMISSIONS, getFirstAccessibleAdminPath, hasAdminPermissionAccess } from "../client/src/lib/admin-navigation";

describe("admin navigation permission helpers", () => {
  it("matches routes when any-of permissions are satisfied", () => {
    expect(
      hasAdminPermissionAccess(["clients:read"], ADMIN_ROUTE_PERMISSIONS.clients),
    ).toBe(true);
    expect(
      hasAdminPermissionAccess(["applications:read"], ADMIN_ROUTE_PERMISSIONS.clients),
    ).toBe(false);
  });

  it("matches routes when all-of permissions are satisfied", () => {
    expect(
      hasAdminPermissionAccess(["clients:read", "clients:update"], ADMIN_ROUTE_PERMISSIONS.editClient),
    ).toBe(true);
    expect(
      hasAdminPermissionAccess(["clients:read"], ADMIN_ROUTE_PERMISSIONS.editClient),
    ).toBe(false);
  });

  it("returns the first accessible admin path from the configured nav order", () => {
    expect(getFirstAccessibleAdminPath(["pricing-rules:read"])).toBe("/admin/pricing");
    expect(getFirstAccessibleAdminPath(["users:read"])).toBe("/admin/rbac");
  });

  it("falls back to admin settings when no nav permissions are assigned", () => {
    expect(getFirstAccessibleAdminPath([])).toBe("/admin/settings");
  });
});
