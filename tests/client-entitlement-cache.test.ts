import { describe, expect, it } from "vitest";
import { queryClient } from "../client/src/lib/queryClient";

/**
 * The client cache is deliberately aggressive — `staleTime: Infinity`, no refetch on focus —
 * because almost everything it holds only changes when this tab changes it.
 *
 * Entitlements are the exception. Credit access, dangerous goods and permissions are granted by
 * an administrator elsewhere, so the first answer a tab receives is the wrong one the moment
 * that approval lands. A client requested credit access, an admin approved it 37 seconds later,
 * and the dangerous goods quotation they were looking at kept offering card payment only.
 */
describe("client entitlement queries", () => {
  const entitlements = [
    "/api/client/account",
    "/api/client/credit-access",
    "/api/client/dangerous-goods",
    "/api/client/sales-features",
    "/api/client/my-permissions",
  ];

  it("always refetches what an administrator can change", () => {
    for (const path of entitlements) {
      const defaults = queryClient.getQueryDefaults([path]);
      expect(defaults.staleTime, path).toBe(0);
      expect(defaults.refetchOnMount, path).toBe("always");
      expect(defaults.refetchOnWindowFocus, path).toBe(true);
    }
  });

  it("leaves every other query on the aggressive cache", () => {
    // Shipment lists, invoices and rates are only changed by this tab, and refetching them on
    // every mount is what the Infinity default exists to avoid.
    for (const path of ["/api/client/shipments", "/api/client/invoices", "/api/notifications"]) {
      expect(queryClient.getQueryDefaults([path]).staleTime, path).toBeUndefined();
    }
  });
});
