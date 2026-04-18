import { describe, expect, it } from "vitest";
import { getDefaultAuthenticatedPath, getPasswordChangePath, getPostLoginPath } from "../client/src/lib/auth-routing";

describe("auth routing helpers", () => {
  it("returns the correct default home path for each user type", () => {
    expect(getDefaultAuthenticatedPath("admin")).toBe("/admin");
    expect(getDefaultAuthenticatedPath("client")).toBe("/client");
  });

  it("returns the correct password change path for each user type", () => {
    expect(getPasswordChangePath("admin")).toBe("/admin/settings");
    expect(getPasswordChangePath("client")).toBe("/client/settings");
  });

  it("sends users with temporary passwords to the correct settings page", () => {
    expect(getPostLoginPath({ userType: "admin", mustChangePassword: true })).toBe("/admin/settings");
    expect(getPostLoginPath({ userType: "client", mustChangePassword: true })).toBe("/client/settings");
  });

  it("sends users without a password reset requirement to their dashboard home", () => {
    expect(getPostLoginPath({ userType: "admin", mustChangePassword: false })).toBe("/admin");
    expect(getPostLoginPath({ userType: "client", mustChangePassword: false })).toBe("/client");
  });
});
