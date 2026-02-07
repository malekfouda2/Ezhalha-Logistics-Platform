import { describe, it, expect } from "vitest";
import {
  loginSchema,
  applicationFormSchema,
  createShipmentSchema,
  UserType,
  ClientProfile,
  ShipmentType,
  ShipmentStatus,
  ApplicationStatus,
  PaymentStatus,
  AccountType,
  ClientPermission,
  ALL_CLIENT_PERMISSIONS,
} from "@shared/schema";

describe("Schema Enums", () => {
  it("should define UserType with admin and client", () => {
    expect(UserType.ADMIN).toBe("admin");
    expect(UserType.CLIENT).toBe("client");
  });

  it("should define ClientProfile tiers", () => {
    expect(ClientProfile.REGULAR).toBe("regular");
    expect(ClientProfile.MID_LEVEL).toBe("mid_level");
    expect(ClientProfile.VIP).toBe("vip");
  });

  it("should define ShipmentType directions", () => {
    expect(ShipmentType.DOMESTIC).toBe("domestic");
    expect(ShipmentType.INBOUND).toBe("inbound");
    expect(ShipmentType.OUTBOUND).toBe("outbound");
  });

  it("should define ShipmentStatus values", () => {
    expect(ShipmentStatus.PROCESSING).toBe("processing");
    expect(ShipmentStatus.IN_TRANSIT).toBe("in_transit");
    expect(ShipmentStatus.DELIVERED).toBe("delivered");
    expect(ShipmentStatus.CANCELLED).toBe("cancelled");
  });

  it("should define ApplicationStatus values", () => {
    expect(ApplicationStatus.PENDING).toBe("pending");
    expect(ApplicationStatus.APPROVED).toBe("approved");
    expect(ApplicationStatus.REJECTED).toBe("rejected");
  });

  it("should define PaymentStatus values", () => {
    expect(PaymentStatus.PENDING).toBe("pending");
    expect(PaymentStatus.COMPLETED).toBe("completed");
    expect(PaymentStatus.FAILED).toBe("failed");
  });

  it("should define AccountType values", () => {
    expect(AccountType.COMPANY).toBe("company");
    expect(AccountType.INDIVIDUAL).toBe("individual");
  });

  it("should define ClientPermission values", () => {
    expect(ClientPermission.VIEW_SHIPMENTS).toBe("view_shipments");
    expect(ClientPermission.CREATE_SHIPMENTS).toBe("create_shipments");
    expect(ClientPermission.VIEW_INVOICES).toBe("view_invoices");
    expect(ClientPermission.VIEW_PAYMENTS).toBe("view_payments");
    expect(ClientPermission.MAKE_PAYMENTS).toBe("make_payments");
    expect(ClientPermission.MANAGE_USERS).toBe("manage_users");
  });

  it("should have ALL_CLIENT_PERMISSIONS contain all permission values", () => {
    expect(ALL_CLIENT_PERMISSIONS).toHaveLength(6);
    expect(ALL_CLIENT_PERMISSIONS).toContain("view_shipments");
    expect(ALL_CLIENT_PERMISSIONS).toContain("create_shipments");
    expect(ALL_CLIENT_PERMISSIONS).toContain("view_invoices");
    expect(ALL_CLIENT_PERMISSIONS).toContain("view_payments");
    expect(ALL_CLIENT_PERMISSIONS).toContain("make_payments");
    expect(ALL_CLIENT_PERMISSIONS).toContain("manage_users");
  });
});

describe("Login Schema Validation", () => {
  it("should accept valid login data", () => {
    const result = loginSchema.safeParse({
      username: "admin",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty username", () => {
    const result = loginSchema.safeParse({
      username: "",
      password: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe("Username is required");
    }
  });

  it("should reject empty password", () => {
    const result = loginSchema.safeParse({
      username: "admin",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe("Password is required");
    }
  });

  it("should reject missing fields", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject non-string values", () => {
    const result = loginSchema.safeParse({
      username: 123,
      password: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("Application Form Schema Validation", () => {
  const validApplication = {
    accountType: "company" as const,
    name: "John Smith",
    email: "john@example.com",
    phone: "12345678",
    companyName: "Smith Corp",
    shippingContactName: "John Smith",
    shippingContactPhone: "12345678",
    shippingCountryCode: "US",
    shippingStateOrProvince: "California",
    shippingCity: "Los Angeles",
    shippingPostalCode: "90001",
    shippingAddressLine1: "123 Main Street",
  };

  it("should accept valid company application", () => {
    const result = applicationFormSchema.safeParse(validApplication);
    expect(result.success).toBe(true);
  });

  it("should accept valid individual application", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      accountType: "individual",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid account type", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      accountType: "enterprise",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short name", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      name: "A",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid email", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short phone", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      phone: "123",
    });
    expect(result.success).toBe(false);
  });

  it("should require short address for Saudi Arabia", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      shippingCountryCode: "SA",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const shortAddrError = result.error.errors.find(
        (e) => e.path.includes("shippingShortAddress")
      );
      expect(shortAddrError).toBeDefined();
    }
  });

  it("should accept Saudi Arabia application with short address", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      shippingCountryCode: "SA",
      shippingShortAddress: "RCTB4359",
    });
    expect(result.success).toBe(true);
  });

  it("should not require short address for non-SA countries", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      shippingCountryCode: "US",
    });
    expect(result.success).toBe(true);
  });

  it("should accept optional documents array", () => {
    const result = applicationFormSchema.safeParse({
      ...validApplication,
      documents: ["doc1.pdf", "doc2.pdf"],
    });
    expect(result.success).toBe(true);
  });
});

describe("Create Shipment Schema Validation", () => {
  const validShipment = {
    senderName: "John Smith",
    senderAddress: "123 Main Street",
    senderCity: "Los Angeles",
    senderCountry: "US",
    senderPhone: "12345678",
    recipientName: "Jane Doe",
    recipientAddress: "456 Oak Avenue",
    recipientCity: "New York",
    recipientCountry: "US",
    recipientPhone: "87654321",
    weight: "5.5",
    packageType: "FEDEX_BOX",
  };

  it("should accept valid shipment data", () => {
    const result = createShipmentSchema.safeParse(validShipment);
    expect(result.success).toBe(true);
  });

  it("should reject missing sender name", () => {
    const { senderName, ...invalid } = validShipment;
    const result = createShipmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject missing recipient name", () => {
    const { recipientName, ...invalid } = validShipment;
    const result = createShipmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject missing weight", () => {
    const { weight, ...invalid } = validShipment;
    const result = createShipmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject missing package type", () => {
    const { packageType, ...invalid } = validShipment;
    const result = createShipmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should accept optional dimensions", () => {
    const result = createShipmentSchema.safeParse({
      ...validShipment,
      dimensions: "10x10x10",
    });
    expect(result.success).toBe(true);
  });

  it("should reject short address fields", () => {
    const result = createShipmentSchema.safeParse({
      ...validShipment,
      senderAddress: "123",
    });
    expect(result.success).toBe(false);
  });
});
