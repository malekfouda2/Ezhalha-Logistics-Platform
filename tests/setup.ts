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
  sendEmail: vi.fn().mockResolvedValue(true),
  sendAccountCredentials: vi.fn().mockResolvedValue(undefined),
  sendApplicationReceived: vi.fn().mockResolvedValue(undefined),
  sendApplicationRejected: vi.fn().mockResolvedValue(undefined),
  notifyAdminNewApplication: vi.fn().mockResolvedValue(undefined),
  sendCreditInvoiceCreated: vi.fn().mockResolvedValue(true),
  sendCreditInvoiceReminder: vi.fn().mockResolvedValue(true),
  sendShipmentExtraFeesNotification: vi.fn().mockResolvedValue(true),
}));
