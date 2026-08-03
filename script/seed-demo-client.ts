/**
 * Seeds a presentable demo client account with dummy shipments, invoices and
 * payments for pitch-deck screenshots.
 *
 * Run: npx tsx script/seed-demo-client.ts
 *
 * Safe to re-run: it deletes any previous demo account (by email) first.
 */
import "../server/load-env";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  clientAccounts,
  users,
  shipments,
  invoices,
  payments,
} from "@shared/schema";

const DEMO_EMAIL = "demo@ezhalha.co";
const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "EzhalhaDemo2026!";
const SALT_ROUNDS = 10;

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

type SeedShipment = {
  createdDaysAgo: number;
  recipientName: string;
  recipientCity: string;
  recipientCountry: string;
  recipientPhone: string;
  recipientAddress: string;
  shipmentType: string;
  isDdp?: boolean;
  fulfillmentType?: string;
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  weight: string;
  packageType: string;
  numberOfPackages: number;
  status: string;
  paymentStatus: string;
  baseRate: number;
  finalPrice: number;
  deliveredDaysAgo?: number;
  etaDaysFromNow?: number;
  invoiceStatus?: "paid" | "pending";
};

// Sender = the demo company's default shipping origin (Riyadh warehouse).
const sender = {
  senderName: "Nova Retail Group",
  senderAddress: "King Fahd Road, Al Olaya District",
  senderCity: "Riyadh",
  senderStateOrProvince: "Riyadh Province",
  senderPostalCode: "12211",
  senderCountry: "SA",
  senderPhone: "+966112345678",
  senderEmail: DEMO_EMAIL,
};

// Dates chosen so the current month leads on volume and spend for a clean
// upward trend. Big-ticket DDP shipments are kept in older months so the
// month-over-month percentages stay believable. Recent items use fractional
// days so several land in the current month with distinct timestamps.
const seedShipments: SeedShipment[] = [
  // ---- Feb ----
  { createdDaysAgo: 150, recipientName: "Aisha Rahman", recipientCity: "Dubai", recipientCountry: "AE", recipientPhone: "+971501112233", recipientAddress: "Sheikh Zayed Road, Business Bay", shipmentType: "outbound", carrierCode: "DHL", carrierName: "DHL Express", serviceType: "EXPRESS WORLDWIDE", weight: "4.50", packageType: "BOX", numberOfPackages: 2, status: "delivered", paymentStatus: "paid", baseRate: 210, finalPrice: 289, deliveredDaysAgo: 147, invoiceStatus: "paid" },
  // ---- Mar ----
  { createdDaysAgo: 115, recipientName: "Mohammed Al Qahtani", recipientCity: "Jeddah", recipientCountry: "SA", recipientPhone: "+966505556677", recipientAddress: "Prince Sultan Street, Al Rawdah", shipmentType: "domestic", carrierCode: "ARAMEX", carrierName: "Aramex", serviceType: "DOMESTIC EXPRESS", weight: "2.10", packageType: "PAK", numberOfPackages: 1, status: "delivered", paymentStatus: "paid", baseRate: 45, finalPrice: 69, deliveredDaysAgo: 112, invoiceStatus: "paid" },
  // ---- Apr ----
  { createdDaysAgo: 80, recipientName: "Sophie Müller", recipientCity: "Berlin", recipientCountry: "DE", recipientPhone: "+491512345678", recipientAddress: "Unter den Linden 10, Mitte", shipmentType: "outbound", carrierCode: "DHL", carrierName: "DHL Express", serviceType: "EXPRESS WORLDWIDE", weight: "5.80", packageType: "BOX", numberOfPackages: 2, status: "delivered", paymentStatus: "paid", baseRate: 380, finalPrice: 512, deliveredDaysAgo: 75, invoiceStatus: "paid" },
  // ---- May (big-ticket DDP kept here so trends stay believable) ----
  { createdDaysAgo: 50, recipientName: "Guangzhou Trade Co.", recipientCity: "Guangzhou", recipientCountry: "CN", recipientPhone: "+8613800138000", recipientAddress: "Tianhe District, Zhujiang New Town", shipmentType: "inbound", isDdp: true, carrierCode: "DHL", carrierName: "DHL Express", serviceType: "DDP AIR LANE", weight: "48.00", packageType: "PALLET", numberOfPackages: 6, status: "delivered", paymentStatus: "paid", baseRate: 3100, finalPrice: 3850, deliveredDaysAgo: 44, invoiceStatus: "paid" },
  { createdDaysAgo: 40, recipientName: "Shenzhen Electronics Ltd.", recipientCity: "Shenzhen", recipientCountry: "CN", recipientPhone: "+8613700137000", recipientAddress: "Nanshan District, Science Park", shipmentType: "inbound", isDdp: true, carrierCode: "FEDEX", carrierName: "FedEx", serviceType: "DDP AIR LANE", weight: "62.00", packageType: "PALLET", numberOfPackages: 8, status: "delivered", paymentStatus: "paid", baseRate: 4200, finalPrice: 5180, deliveredDaysAgo: 33, invoiceStatus: "paid" },
  // ---- Jun ----
  { createdDaysAgo: 20, recipientName: "James Carter", recipientCity: "London", recipientCountry: "GB", recipientPhone: "+447700900123", recipientAddress: "221B Baker Street, Marylebone", shipmentType: "outbound", carrierCode: "FEDEX", carrierName: "FedEx", serviceType: "INTERNATIONAL PRIORITY", weight: "7.20", packageType: "BOX", numberOfPackages: 3, status: "delivered", paymentStatus: "paid", baseRate: 520, finalPrice: 690, deliveredDaysAgo: 16, invoiceStatus: "paid" },
  { createdDaysAgo: 12, recipientName: "Khalid Al Otaibi", recipientCity: "Mecca", recipientCountry: "SA", recipientPhone: "+966544332211", recipientAddress: "Ibrahim Al Khalil Road, Al Aziziyah", shipmentType: "domestic", carrierCode: "ARAMEX", carrierName: "Aramex", serviceType: "DOMESTIC EXPRESS", weight: "3.60", packageType: "BOX", numberOfPackages: 1, status: "in_transit", paymentStatus: "paid", baseRate: 55, finalPrice: 82, etaDaysFromNow: 1, invoiceStatus: "paid" },
  // ---- Current month (daysAgo <= 1.0 guarantees same calendar month regardless
  //      of the time of day the seed runs; distinct values give distinct times) ----
  { createdDaysAgo: 0.9, recipientName: "Olivia Bennett", recipientCity: "New York", recipientCountry: "US", recipientPhone: "+12125550147", recipientAddress: "350 5th Avenue, Manhattan", shipmentType: "outbound", carrierCode: "FEDEX", carrierName: "FedEx", serviceType: "INTERNATIONAL PRIORITY", weight: "6.30", packageType: "BOX", numberOfPackages: 2, status: "in_transit", paymentStatus: "paid", baseRate: 610, finalPrice: 795, etaDaysFromNow: 2, invoiceStatus: "paid" },
  { createdDaysAgo: 0.7, recipientName: "Yuki Tanaka", recipientCity: "Tokyo", recipientCountry: "JP", recipientPhone: "+81312345678", recipientAddress: "1 Chome, Chiyoda, Marunouchi", shipmentType: "outbound", carrierCode: "DHL", carrierName: "DHL Express", serviceType: "EXPRESS WORLDWIDE", weight: "8.90", packageType: "BOX", numberOfPackages: 3, status: "processing", paymentStatus: "paid", baseRate: 720, finalPrice: 940, etaDaysFromNow: 5, invoiceStatus: "paid" },
  { createdDaysAgo: 0.5, recipientName: "Fatima Al Zahrani", recipientCity: "Dammam", recipientCountry: "SA", recipientPhone: "+966533221100", recipientAddress: "King Saud Street, Al Faisaliyah", shipmentType: "domestic", fulfillmentType: "local", carrierCode: "SMSA", carrierName: "SMSA Express", serviceType: "LOCAL DELIVERY", weight: "1.40", packageType: "ENVELOPE", numberOfPackages: 1, status: "delivered", paymentStatus: "paid", baseRate: 22, finalPrice: 35, deliveredDaysAgo: 0.1, invoiceStatus: "paid" },
  { createdDaysAgo: 0.3, recipientName: "Noura Al Harbi", recipientCity: "Riyadh", recipientCountry: "SA", recipientPhone: "+966501234567", recipientAddress: "Takhassusi Street, Al Muhammadiyah", shipmentType: "domestic", fulfillmentType: "local", carrierCode: "NAQEL", carrierName: "Naqel Express", serviceType: "LOCAL DELIVERY", weight: "2.00", packageType: "PAK", numberOfPackages: 1, status: "delivered", paymentStatus: "paid", baseRate: 25, finalPrice: 39, deliveredDaysAgo: 0.05, invoiceStatus: "paid" },
  { createdDaysAgo: 0.1, recipientName: "Emma Wilson", recipientCity: "Sydney", recipientCountry: "AU", recipientPhone: "+61412345678", recipientAddress: "1 Martin Place, CBD", shipmentType: "outbound", carrierCode: "DHL", carrierName: "DHL Express", serviceType: "EXPRESS WORLDWIDE", weight: "4.10", packageType: "BOX", numberOfPackages: 1, status: "payment_pending", paymentStatus: "pending", baseRate: 430, finalPrice: 560, invoiceStatus: "pending" },
];

async function main() {
  console.log("Seeding demo client…");

  // Clean up any previous demo run (hard delete for a fresh, tidy dataset).
  const existing = await db.select().from(clientAccounts).where(eq(clientAccounts.email, DEMO_EMAIL));
  for (const acct of existing) {
    await db.delete(payments).where(eq(payments.clientAccountId, acct.id));
    await db.delete(invoices).where(eq(invoices.clientAccountId, acct.id));
    await db.delete(shipments).where(eq(shipments.clientAccountId, acct.id));
    await db.delete(users).where(eq(users.clientAccountId, acct.id));
    await db.delete(clientAccounts).where(eq(clientAccounts.id, acct.id));
    console.log(`  removed previous demo account ${acct.accountNumber}`);
  }

  const client = await storage.createClientAccount({
    accountType: "company",
    name: "Nova Retail Group",
    nameAr: "مجموعة نوفا للتجزئة",
    email: DEMO_EMAIL,
    phone: "+966112345678",
    country: "SA",
    companyName: "Nova Retail Group",
    companyNameAr: "مجموعة نوفا للتجزئة",
    crNumber: "1010567890",
    taxNumber: "310123456700003",
    nationalAddressStreet: "King Fahd Road",
    nationalAddressBuilding: "7420",
    nationalAddressDistrict: "Al Olaya",
    nationalAddressCity: "Riyadh",
    nationalAddressPostalCode: "12211",
    profile: "regular",
    isActive: true,
    creditEnabled: true,
    creditLimitSar: "75000",
    shippingContactName: "Nova Retail Group",
    shippingContactPhone: "+966112345678",
    shippingCountryCode: "SA",
    shippingStateOrProvince: "Riyadh Province",
    shippingCity: "Riyadh",
    shippingPostalCode: "12211",
    shippingAddressLine1: "King Fahd Road, Al Olaya District",
    shippingShortAddress: "RRRD2929",
  });
  console.log(`  created account ${client.accountNumber} (${client.id})`);

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  await storage.createUser({
    username: DEMO_USERNAME,
    email: DEMO_EMAIL,
    fullName: "Omar Al Faisal",
    password: hashedPassword,
    userType: "client",
    clientAccountId: client.id,
    isPrimaryContact: true,
    mustChangePassword: false,
    isActive: true,
  });
  console.log(`  created login user ${DEMO_USERNAME}`);

  let shipCount = 0;
  let invCount = 0;
  let payCount = 0;

  for (const s of seedShipments) {
    const createdAt = daysAgo(s.createdDaysAgo);
    const margin = Number((s.finalPrice - s.baseRate).toFixed(2));
    const vat = Number((s.finalPrice * 0.15).toFixed(2));

    const shipment = await storage.createShipment({
      clientAccountId: client.id,
      ...sender,
      recipientName: s.recipientName,
      recipientAddress: s.recipientAddress,
      recipientCity: s.recipientCity,
      recipientCountry: s.recipientCountry,
      recipientPhone: s.recipientPhone,
      weight: s.weight,
      weightUnit: "KG",
      packageType: s.packageType,
      numberOfPackages: s.numberOfPackages,
      shipmentType: s.shipmentType,
      isDdp: s.isDdp ?? false,
      fulfillmentType: s.fulfillmentType ?? "carrier",
      serviceType: s.serviceType,
      currency: "SAR",
      status: s.status,
      paymentStatus: s.paymentStatus,
      baseRate: String(s.baseRate),
      margin: String(margin),
      marginAmount: String(margin),
      finalPrice: String(s.finalPrice),
      clientTotalAmountSar: String(s.finalPrice),
      sellSubtotalAmountSar: String(Number((s.finalPrice - vat).toFixed(2))),
      sellTaxAmountSar: String(vat),
      carrierCode: s.carrierCode,
      carrierName: s.carrierName,
      carrierServiceType: s.serviceType,
    });

    // Backdate timestamps + set delivery dates for a realistic timeline.
    const updates: Record<string, unknown> = { createdAt, updatedAt: createdAt, statusChangedAt: createdAt };
    if (s.deliveredDaysAgo != null) {
      updates.actualDelivery = daysAgo(s.deliveredDaysAgo);
      updates.estimatedDelivery = daysAgo(s.deliveredDaysAgo + 1);
    } else if (s.etaDaysFromNow != null) {
      updates.estimatedDelivery = new Date(now.getTime() + s.etaDaysFromNow * 24 * 60 * 60 * 1000);
    }
    await db.update(shipments).set(updates).where(eq(shipments.id, shipment.id));
    shipCount++;

    // Invoice per shipment.
    const invoice = await storage.createInvoice({
      clientAccountId: client.id,
      shipmentId: shipment.id,
      invoiceType: "SHIPMENT",
      description: `Shipping charges — ${shipment.trackingNumber} to ${s.recipientCity}, ${s.recipientCountry}`,
      amount: String(s.finalPrice),
      status: s.invoiceStatus === "paid" ? "paid" : "pending",
      dueDate: new Date(createdAt.getTime() + 15 * 24 * 60 * 60 * 1000),
      taxAmountSar: String(vat),
      currency: "SAR",
    });
    const invUpdates: Record<string, unknown> = { createdAt };
    if (s.invoiceStatus === "paid") invUpdates.paidAt = daysAgo(s.createdDaysAgo);
    await db.update(invoices).set(invUpdates).where(eq(invoices.id, invoice.id));
    invCount++;

    // Payment for paid invoices.
    if (s.invoiceStatus === "paid") {
      const payment = await storage.createPayment({
        invoiceId: invoice.id,
        clientAccountId: client.id,
        amount: String(s.finalPrice),
        paymentMethod: s.finalPrice > 1000 ? "credit" : "card",
        status: "completed",
        transactionId: `demo_txn_${shipment.trackingNumber}`,
      });
      await db.update(payments).set({ createdAt }).where(eq(payments.id, payment.id));
      payCount++;
    }
  }

  console.log(`\nDone. ${shipCount} shipments, ${invCount} invoices, ${payCount} payments.`);
  console.log("\n=== DEMO CLIENT CREDENTIALS ===");
  console.log(`  URL:      http://localhost:3002/  (client portal)`);
  console.log(`  Username: ${DEMO_USERNAME}`);
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Account:  ${client.accountNumber}`);
  console.log("================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
