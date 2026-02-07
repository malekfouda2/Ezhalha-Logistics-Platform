import { vi } from "vitest";

vi.mock("../server/services/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logAuditToFile: vi.fn(),
  logApiRequest: vi.fn(),
  logWebhook: vi.fn(),
  logPricingChange: vi.fn(),
  logProfileChange: vi.fn(),
}));

vi.mock("../server/services/email", () => ({
  sendAccountCredentials: vi.fn().mockResolvedValue(undefined),
  sendApplicationReceived: vi.fn().mockResolvedValue(undefined),
  sendApplicationRejected: vi.fn().mockResolvedValue(undefined),
  notifyAdminNewApplication: vi.fn().mockResolvedValue(undefined),
}));
