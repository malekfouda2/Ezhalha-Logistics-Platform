import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchMock = vi.fn().mockResolvedValue({ sent: true, deliveryId: "test-delivery", skipped: false });
const getIntegrationHealthMock = vi.fn();

// The digest is a template now: its subject and wrapper are editable in Admin > Email Settings,
// and it hands the dispatcher the numbers and the table it built. So these tests assert what the
// digest still decides — who it goes to, what it counted, and what went into the body — rather
// than a subject line it no longer owns.
vi.mock("../server/services/email-delivery", () => ({
  dispatchTemplatedEmail: (...args: unknown[]) => dispatchMock(...args),
}));

vi.mock("../server/services/integration-health", () => ({
  getIntegrationHealth: (...args: unknown[]) => getIntegrationHealthMock(...args),
}));

import { sendIntegrationHealthDigest } from "../server/services/integration-health-digest";

function group(overrides: Record<string, unknown> = {}) {
  return {
    serviceName: "dhl",
    operation: "POST /pickups",
    statusCode: 400,
    count: 21,
    firstSeen: new Date(),
    lastSeen: new Date(),
    explanation: {
      code: "DHL_5006",
      category: "date",
      title: "DHL will not collect on the requested date",
      cause: "The collection date falls on a day DHL does not work at the origin.",
      action: "Set the pickup date to the next working day at the origin.",
      retry: "after_fix",
      recognised: true,
      raw: "400 - 5006: Pickup is not allowed for this shipment date.",
    },
    ...overrides,
  };
}

beforeEach(() => {
  dispatchMock.mockClear();
  getIntegrationHealthMock.mockReset();
  process.env.INTEGRATION_DIGEST_EMAIL = "ops@ezhalha.co";
});

afterEach(() => {
  delete process.env.INTEGRATION_DIGEST_EMAIL;
  delete process.env.ADMIN_EMAIL;
});

describe("when the digest sends", () => {
  it("sends when something needs a person", async () => {
    getIntegrationHealthMock.mockResolvedValue({ services: [], failureGroups: [group()] });

    await expect(sendIntegrationHealthDigest()).resolves.toBe(true);
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    const call = dispatchMock.mock.calls[0][0];
    expect(call.slug).toBe("integration_health_digest");
    expect(call.to).toBe("ops@ezhalha.co");
    expect(call.variables.failure_count).toBe("21");
    // Leads with the fix, not the carrier's raw string.
    expect(call.variables.digest_body).toContain("Set the pickup date to the next working day");
  });

  it("falls back to ADMIN_EMAIL", async () => {
    delete process.env.INTEGRATION_DIGEST_EMAIL;
    process.env.ADMIN_EMAIL = "admin@ezhalha.co";
    getIntegrationHealthMock.mockResolvedValue({ services: [], failureGroups: [group()] });

    await sendIntegrationHealthDigest();
    expect(dispatchMock.mock.calls[0][0].to).toBe("admin@ezhalha.co");
  });
});

describe("when the digest stays quiet", () => {
  it("sends nothing when there were no failures", async () => {
    getIntegrationHealthMock.mockResolvedValue({ services: [], failureGroups: [] });

    await expect(sendIntegrationHealthDigest()).resolves.toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("ignores transient carrier outages", async () => {
    // A carrier 5xx is retried automatically. Emailing about it every day is how a digest
    // becomes something people filter away, and then it is useless on the day it matters.
    getIntegrationHealthMock.mockResolvedValue({
      services: [],
      failureGroups: [
        group({
          count: 400,
          explanation: { ...group().explanation, retry: "retry", title: "Could not reach the carrier" },
        }),
      ],
    });

    await expect(sendIntegrationHealthDigest()).resolves.toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("still sends when actionable failures sit alongside transient ones", async () => {
    getIntegrationHealthMock.mockResolvedValue({
      services: [],
      failureGroups: [
        group({ explanation: { ...group().explanation, retry: "retry" } }),
        group({ count: 7 }),
      ],
    });

    await expect(sendIntegrationHealthDigest()).resolves.toBe(true);
    // Only the actionable one is counted; the transient group is left out entirely.
    expect(dispatchMock.mock.calls[0][0].variables.failure_count).toBe("7");
  });

  it("sends nothing when no recipient is configured", async () => {
    delete process.env.INTEGRATION_DIGEST_EMAIL;
    getIntegrationHealthMock.mockResolvedValue({ services: [], failureGroups: [group()] });

    await expect(sendIntegrationHealthDigest()).resolves.toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("never lets a reporting failure escape", async () => {
    getIntegrationHealthMock.mockRejectedValue(new Error("database is down"));
    await expect(sendIntegrationHealthDigest()).resolves.toBe(false);
  });
});

describe("escaping", () => {
  it("escapes carrier text into the HTML body", async () => {
    getIntegrationHealthMock.mockResolvedValue({
      services: [],
      failureGroups: [
        group({
          explanation: {
            ...group().explanation,
            title: "<script>alert(1)</script>",
          },
        }),
      ],
    });

    await sendIntegrationHealthDigest();
    const body = dispatchMock.mock.calls[0][0].variables.digest_body;
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
  });
});
