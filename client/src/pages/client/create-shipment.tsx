import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { CarrierTrackingLink } from "@/components/carrier-tracking-link";
import { TapCardForm } from "@/components/tap-card-form";
import { LoadingSpinner, LoadingScreen } from "@/components/loading-spinner";
import { SearchableSelect } from "@/components/searchable-select";
import { PhoneInput } from "@/components/phone-input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useQuotationMode } from "@/lib/quotation-mode";
import {
  useGuestMode,
  saveGuestDraft,
  consumeGuestDraft,
  fetchPendingShipmentDraft,
  dismissPendingShipmentDraft,
  type GuestIndicativeQuote,
} from "@/lib/guest-mode";
import { GuestCheckoutGate } from "@/components/guest-gate";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { humanizeError } from "@/lib/friendly-error";
import { GeoSuggestInput, type GeoSuggestion } from "@/components/geo-suggest-input";
import { ArrowLeft, Package, MapPin, Truck, Check, CreditCard, Clock, Plus, Trash2, Search, AlertTriangle, CheckCircle, Pencil, Upload, FileText, X, Percent, Battery, BatteryCharging, Biohazard, Cylinder, FlaskConical, Magnet, Package as PackageIcon, ShieldAlert, TestTube, Wind, Zap, Sparkles } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import { Link } from "wouter";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@/lib/countries";
import { CarrierLogo } from "@/components/carrier-logo";
import type {
  ClientAccount,
  HsCodeSourceValue,
  HsCodeConfidenceValue,
  ShipmentTradeDocument,
} from "@shared/schema";
import {
  FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES,
  ItemCategory,
} from "@shared/schema";
import type { DangerousGoodsDocument } from "@shared/schema";
import {
  DangerousGoodsDocumentType,
  DgAccessibility,
  DgContentKind,
  DgPackingGroup,
  DgQuantityType,
  DgRegulation,
  type DgAccessibilityValue,
  type DgContentKindValue,
  type DgPackingGroupValue,
  type DgQuantityTypeValue,
  type DgRegulationValue,
} from "@shared/dangerous-goods";
import { isPostalCodeRequired } from "@shared/postal-codes";
import { calculateChargeableWeight, type ChargeableWeightSummary } from "@shared/chargeable-weight";
import { format } from "date-fns";

interface ItemFormData {
  itemName: string;
  itemDescription: string;
  category: string;
  material: string;
  countryOfOrigin: string;
  hsCode: string;
  hsCodeSource: HsCodeSourceValue | "";
  hsCodeConfidence: HsCodeConfidenceValue | "";
  hsCodeCandidates: Array<{ code: string; description: string; confidence: number }>;
  price: number;
  currency: string;
  quantity: number;
  showDetails: boolean;
  hsManualEntry: boolean;
}

const GENERIC_NAMES = [
  "parts", "item", "items", "stuff", "accessories", "product", "products",
  "goods", "things", "misc", "miscellaneous", "other", "general", "sample",
  "gift", "package", "box", "shipment", "order",
];

function isGenericItemName(name: string): boolean {
  if (!name || name.trim().length < 4) return true;
  const lower = name.trim().toLowerCase();
  return GENERIC_NAMES.some(g => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g));
}

function getConfidenceBadge(confidence: HsCodeConfidenceValue | "") {
  switch (confidence) {
    case "HIGH": return { label: "High", variant: "default" as const, className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
    case "MEDIUM": return { label: "Medium", variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" };
    case "LOW": return { label: "Low", variant: "secondary" as const, className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" };
    case "MISSING": return { label: "Missing", variant: "destructive" as const, className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" };
    default: return { label: "N/A", variant: "outline" as const, className: "" };
  }
}

function confidenceFromNumber(c: number): HsCodeConfidenceValue {
  if (c >= 0.7) return "HIGH";
  if (c >= 0.4) return "MEDIUM";
  if (c > 0) return "LOW";
  return "MISSING";
}

function formatWeight(value: number | undefined, unit: string | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `0.000 ${unit || "KG"}`;
  }

  return `${value.toFixed(3)} ${unit || "KG"}`;
}

function getChargeableWeightExplanation(summary: ChargeableWeightSummary) {
  const dimensionalPackages = summary.packages.filter((pkg) => pkg.usesDimensionalWeight).length;
  const actualPackages = Math.max(summary.packages.length - dimensionalPackages, 0);

  return formatChargeablePackageCounts(actualPackages, dimensionalPackages);
}

function formatPackageWord(count: number) {
  return `${count} package${count === 1 ? "" : "s"}`;
}

function formatChargeablePackageCounts(actualPackages = 0, dimensionalPackages = 0) {
  return `${formatPackageWord(actualPackages)} charged by actual weight. ${formatPackageWord(dimensionalPackages)} charged by dimensional weight.`;
}

function getChargeableWeightBasisLabel(actualPackages = 0, dimensionalPackages = 0) {
  if (actualPackages > 0 && dimensionalPackages > 0) {
    return "Mixed billing basis";
  }

  if (dimensionalPackages > 0) {
    return "Charged by dimensional weight";
  }

  return "Charged by actual weight";
}

const itemCategories = Object.entries(ItemCategory).map(([key, value]) => ({
  value,
  label: key.charAt(0) + key.slice(1).toLowerCase(),
}));

const itemCurrencies = [
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar" },
  { value: "QAR", label: "QAR - Qatari Riyal" },
  { value: "BHD", label: "BHD - Bahraini Dinar" },
  { value: "OMR", label: "OMR - Omani Rial" },
  { value: "EGP", label: "EGP - Egyptian Pound" },
  { value: "JOD", label: "JOD - Jordanian Dinar" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "TRY", label: "TRY - Turkish Lira" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
];

const INVOICE_ACCEPT = ".pdf,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif";
const PACKAGE_LIST_ACCEPT = ".pdf,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif";

const SUPPORTED_INVOICE_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/gif",
  "image/jpeg",
  "image/png",
]);

const SUPPORTED_PACKAGE_LIST_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/gif",
  "image/jpeg",
  "image/png",
]);

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function normalizeTradeDocumentContentType(contentType: string | undefined, fileName: string): string {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }

  const extension = getFileExtension(fileName);
  return DOCUMENT_MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const defaultItem: ItemFormData = {
  itemName: "",
  itemDescription: "",
  category: "",
  material: "",
  countryOfOrigin: "SA",
  hsCode: "",
  hsCodeSource: "",
  hsCodeConfidence: "",
  hsCodeCandidates: [],
  price: 0,
  currency: "SAR",
  quantity: 1,
  showDetails: false,
  hsManualEntry: false,
};

/**
 * The declaration as the form holds it.
 *
 * Numbers live as strings while the user types, exactly like the item price fields above —
 * a partially typed "0." is not a number and coercing on every keystroke fights the user.
 * `toDangerousGoodsPayload` converts once, at submit.
 */
interface DangerousGoodsCommodityFormData {
  unNumber: string;
  properShippingName: string;
  technicalName: string;
  hazardClass: string;
  packingGroup: DgPackingGroupValue;
  packingInstruction: string;
  quantityAmount: string;
  quantityUnits: string;
  quantityType: DgQuantityTypeValue;
  cargoAircraftOnly: boolean;
  /** Set when this entry came out of the uploaded safety data sheet rather than being typed. */
  fromDocument?: boolean;
  /** Fields the document did not state, highlighted so the client knows what to complete. */
  missingFields?: string[];
}

interface DangerousGoodsExtractionResponse {
  commodities: Array<{
    unNumber: string;
    properShippingName: string;
    technicalName: string;
    hazardClass: string;
    subsidiaryRisks: string[];
    packingGroup: DgPackingGroupValue;
    packingInstruction: string;
    cargoAircraftOnly: boolean;
    missingFields: string[];
  }>;
  productName: string;
  notDangerousGoods: boolean;
  warnings: string[];
}

/**
 * What the client tells us about the goods — which is deliberately not much.
 *
 * The content kind, and a safety data sheet. Everything else on a Shipper's Declaration is
 * completed by operations: the accessibility, the offeror, the 24-hour emergency contact, the
 * signatory, and the net quantity per package (which an SDS never states, because it describes
 * a substance rather than a shipment). Those are not details a shipper can be expected to get
 * right from a form, and a declaration filled in wrongly reads as authoritative right up until
 * the carrier refuses the consignment at acceptance.
 *
 * `commodities` is still here because the safety data sheet extraction pre-fills it and it is
 * worth passing on — but it is a hint for the operator, not something the client confirms.
 */
interface DangerousGoodsFormData {
  regulation: DgRegulationValue;
  contentKind: DgContentKindValue;
  dryIceWeightKg: string;
  /** Index into `packages`; DHL and FedEx both declare goods per package, not per shipment. */
  packageIndex: number;
  commodities: DangerousGoodsCommodityFormData[];
}

const defaultDangerousGoodsCommodity: DangerousGoodsCommodityFormData = {
  unNumber: "",
  properShippingName: "",
  technicalName: "",
  hazardClass: "",
  packingGroup: DgPackingGroup.NONE,
  packingInstruction: "",
  quantityAmount: "",
  quantityUnits: "KG",
  quantityType: DgQuantityType.NET,
  cargoAircraftOnly: false,
};

const defaultDangerousGoods: DangerousGoodsFormData = {
  regulation: DgRegulation.IATA,
  contentKind: DgContentKind.FULLY_REGULATED,
  dryIceWeightKg: "",
  packageIndex: 0,
  commodities: [{ ...defaultDangerousGoodsCommodity }],
};

/**
 * The content types a client picks from, in the order they are most likely to want them.
 *
 * Each maps to exactly one DHL (serviceCode, contentId) pair, so this choice is what decides
 * how the shipment is declared to the carrier — not a cosmetic grouping.
 */
const DANGEROUS_GOODS_CONTENT_KINDS: Array<{
  value: DgContentKindValue;
  label: string;
  description: string;
  icon: typeof Battery;
}> = [
  {
    value: DgContentKind.LITHIUM_ION_PI967_SECTION_II,
    label: "Batteries in equipment",
    description: "Lithium ion cells fitted inside the device — phones, laptops, power tools.",
    icon: BatteryCharging,
  },
  {
    value: DgContentKind.LITHIUM_ION_PI966_SECTION_II,
    label: "Batteries with equipment",
    description: "Lithium ion batteries packed alongside the device they power.",
    icon: Battery,
  },
  {
    value: DgContentKind.LITHIUM_ION_PI965_SECTION_II,
    label: "Batteries on their own",
    description: "Loose lithium ion cells or battery packs shipped by themselves.",
    icon: Zap,
  },
  {
    value: DgContentKind.LITHIUM_METAL_PI970_SECTION_II,
    label: "Lithium metal in equipment",
    description: "Non-rechargeable lithium metal cells fitted inside the device.",
    icon: BatteryCharging,
  },
  {
    value: DgContentKind.LITHIUM_METAL_PI969_SECTION_II,
    label: "Lithium metal with equipment",
    description: "Non-rechargeable lithium metal cells packed alongside the device.",
    icon: Battery,
  },
  {
    value: DgContentKind.FULLY_REGULATED,
    label: "Chemicals & fully regulated",
    description: "Flammables, corrosives, toxics and anything else needing a full declaration.",
    icon: FlaskConical,
  },
  {
    value: DgContentKind.LIMITED_QUANTITIES_ADR,
    label: "Limited quantities",
    description: "Small retail-sized quantities packed to the limited quantity exception.",
    icon: PackageIcon,
  },
  {
    value: DgContentKind.CONSUMER_COMMODITY_ID8000,
    label: "Consumer commodity",
    description: "Retail aerosols, cosmetics and toiletries shipped as ID8000.",
    icon: Wind,
  },
  {
    value: DgContentKind.BIOLOGICAL_SUBSTANCE_UN3373,
    label: "Biological substance",
    description: "Category B diagnostic or clinical specimens shipped as UN3373.",
    icon: Biohazard,
  },
  {
    value: DgContentKind.EXEMPT_SPECIMENS,
    label: "Exempt specimens",
    description: "Human or animal specimens with a minimal likelihood of pathogens.",
    icon: TestTube,
  },
  {
    value: DgContentKind.MAGNETIZED_MATERIAL_UN2807,
    label: "Magnetized material",
    description: "Speakers, motors and magnets strong enough to affect aircraft instruments.",
    icon: Magnet,
  },
  {
    value: DgContentKind.PRESSURIZED_ARTICLES_UN3164,
    label: "Pressurized articles",
    description: "Shock absorbers, gas struts and other articles held under pressure.",
    icon: Cylinder,
  },
  {
    value: DgContentKind.LITHIUM_FULLY_REGULATED,
    label: "Fully regulated lithium",
    description: "Large or damaged lithium batteries outside the Section II allowances.",
    icon: ShieldAlert,
  },
  {
    value: DgContentKind.GENETICALLY_MODIFIED_ORGANISMS,
    label: "Genetically modified organisms",
    description: "GMOs and genetically modified micro-organisms shipped as UN3245.",
    icon: Biohazard,
  },
];

const DG_PACKING_GROUPS: Array<{ value: DgPackingGroupValue; label: string }> = [
  { value: DgPackingGroup.NONE, label: "None" },
  { value: DgPackingGroup.I, label: "I — high danger" },
  { value: DgPackingGroup.II, label: "II — medium danger" },
  { value: DgPackingGroup.III, label: "III — low danger" },
];

const DG_QUANTITY_UNITS = ["KG", "G", "L", "ML"];

/** Convert the form's strings into the declaration the API expects. */
/**
 * The declaration as the client can honestly state it: a content kind, and whatever the safety
 * data sheet gave up. Operations completes the rest before any carrier sees it.
 *
 * Blank commodity fields are sent as undefined rather than empty strings so the server's draft
 * schema treats them as "not stated" instead of "stated to be nothing" — the ops hub then
 * lists each one as outstanding, and the carrier handover stays blocked until they are filled.
 */
function toDangerousGoodsPayload(form: DangerousGoodsFormData) {
  const trimmed = (value: string) => value.trim() || undefined;
  return {
    regulation: form.regulation,
    contentKind: form.contentKind,
    packages: [{
      packageIndex: form.packageIndex,
      commodities: form.commodities.map((commodity) => ({
        unNumber: trimmed(commodity.unNumber.toUpperCase()),
        properShippingName: trimmed(commodity.properShippingName),
        technicalName: trimmed(commodity.technicalName),
        hazardClass: trimmed(commodity.hazardClass),
        packingGroup: commodity.packingGroup === DgPackingGroup.NONE ? undefined : commodity.packingGroup,
        packingInstruction: trimmed(commodity.packingInstruction),
        quantity: Number(commodity.quantityAmount) > 0
          ? {
              amount: Number(commodity.quantityAmount),
              units: commodity.quantityUnits,
              quantityType: commodity.quantityType,
            }
          : undefined,
        cargoAircraftOnly: commodity.cargoAircraftOnly || undefined,
      })),
    }],
    dryIceWeightKg: form.dryIceWeightKg ? Number(form.dryIceWeightKg) : undefined,
  };
}

/**
 * The customs value, stated plainly with its currency.
 *
 * A client declared a 100 USD item and never touched the currency selector, so it went to
 * customs as 100 SAR — roughly a quarter of its real value. Nothing converted anything; the
 * currency simply defaulted and the small grey "100 SAR" in the item row was easy to read
 * past. This says the total out loud, in the currency it will actually be declared in, on the
 * last screen before the client pays.
 */
function DeclaredValueSummary({ items }: { items: ItemFormData[] }) {
  const priced = items.filter((item) => item.itemName.trim() && Number(item.price) > 0);
  if (priced.length === 0) return null;

  // Grouped by currency rather than summed blindly: adding SAR to USD would produce a
  // confident, meaningless number.
  const totals = new Map<string, number>();
  for (const item of priced) {
    const currency = item.currency || "SAR";
    totals.set(currency, (totals.get(currency) || 0) + Number(item.price) * Number(item.quantity || 1));
  }

  const entries = Array.from(totals.entries());

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Declared customs value:{" "}
            {entries.map(([currency, total], index) => (
              <span key={currency} data-testid={`text-declared-total-${currency}`}>
                {index > 0 && " + "}
                {total.toFixed(2)} {currency}
              </span>
            ))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This is the value declared to customs. Check the currency is right — if your prices
            are in another currency, set it on each item. We do not convert it.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ShipmentFormData {
  shipmentType: "domestic" | "inbound" | "outbound";
  isDdp: boolean;
  carrier: string;
  serviceType: string;
  shipper: {
    name: string;
    company?: string;
    phone: string;
    email?: string;
    countryCode: string;
    city: string;
    postalCode: string;
    addressLine1: string;
    addressLine2?: string;
    stateOrProvince?: string;
    shortAddress?: string;
  };
  recipient: {
    name: string;
    company?: string;
    phone: string;
    email?: string;
    countryCode: string;
    city: string;
    postalCode: string;
    addressLine1: string;
    addressLine2?: string;
    stateOrProvince?: string;
    shortAddress?: string;
  };
  packages: Array<{
    reference?: string;
    weight: number;
    length: number;
    width: number;
    height: number;
  }>;
  items: ItemFormData[];
  tradeDocuments: ShipmentTradeDocument[];
  // Declared before rates are fetched, because the carrier's dangerous goods surcharge is
  // only included in a quote that declares the goods.
  hasDangerousGoods: boolean;
  dangerousGoods: DangerousGoodsFormData;
  dangerousGoodsDocuments: DangerousGoodsDocument[];
  weightUnit: "LB" | "KG";
  dimensionUnit: "IN" | "CM";
  packageType: string;
  currency: string;
}

interface RateQuote {
  quoteId: string;
  carrierCode: string;
  carrierName: string;
  serviceType: string;
  serviceName: string;
  finalPrice: number;
  currency: string;
  transitDays: number;
  estimatedDelivery?: string;
  actualWeight?: number;
  dimensionalWeight?: number;
  chargeableWeight?: number;
  chargeableWeightUnit?: "KG" | "LB";
  chargeableWeightSource?: "carrier" | "system";
}

interface RatesResponse {
  quotes: RateQuote[];
  expiresAt: string;
  availableCarriers?: Array<{
    code: string;
    name: string;
  }>;
}

interface InvoiceExtractionResponse {
  items: Array<{
    itemName: string;
    itemDescription: string;
    category: string;
    material: string;
    countryOfOrigin: string;
    hsCode: string;
    hsCodeSource: HsCodeSourceValue;
    hsCodeConfidence: HsCodeConfidenceValue;
    hsCodeCandidates: Array<{ code: string; description: string; confidence: number }>;
    price: number;
    currency: string;
    quantity: number;
  }>;
  detectedCurrency: string;
  extractionMethod: "deterministic" | "gemini";
  summary: {
    importedItemCount: number;
    aiAssisted: boolean;
    hasParsingWarnings: boolean;
    autoMatchedHsCodeCount: number;
    hsCodeReviewCount: number;
  };
}

interface PackageExtractionResponse {
  packages: Array<{
    packageNumber: string;
    weight: number;
    length: number;
    width: number;
    height: number;
  }>;
  detectedWeightUnit: "LB" | "KG";
  detectedDimensionUnit: "IN" | "CM";
  extractionMethod: "deterministic" | "gemini";
  summary: {
    importedPackageCount: number;
    totalWeight: number;
    aiAssisted: boolean;
    hasParsingWarnings: boolean;
  };
}

interface CheckoutResponse {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierCode?: string;
  carrierName?: string;
  serviceType?: string;
  serviceName?: string;
  actualWeight?: number;
  dimensionalWeight?: number;
  chargeableWeight?: number;
  chargeableWeightUnit?: "KG" | "LB";
  chargeableActualPackageCount?: number;
  chargeableDimensionalPackageCount?: number;
}

interface ShipmentPaymentResponse {
  shipmentId: string;
  trackingNumber: string;
  paymentId: string;
  transactionUrl?: string;
  amount: number;
  currency: string;
  paymentStatus: string;
}

interface ConfirmResponse {
  shipment: any;
  carrierTrackingNumber: string;
  labelUrl?: string;
  estimatedDelivery?: string;
}

interface AddressBookEntry {
  id: string;
  label: string;
  source: "default_shipping" | "shipment_history";
  useForShipper: boolean;
  useForRecipient: boolean;
  lastUsedAt: string | null;
  name: string;
  phone: string;
  email?: string | null;
  countryCode: string;
  city: string;
  postalCode?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  stateOrProvince?: string | null;
  shortAddress?: string | null;
}

// Shared with the server validator — see shared/postal-codes.ts.

const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA"]);

// Per-country postal-code format checks (common lanes). Catches typos up-front so the carrier
// doesn't reject them with a cryptic error at the rates step. Countries not listed only need a
// non-empty value. { regex, hint }.
const POSTAL_FORMATS: Record<string, { regex: RegExp; hint: string }> = {
  SA: { regex: /^\d{5}$/, hint: "Saudi postal codes are 5 digits (e.g. 12345)." },
  US: { regex: /^\d{5}(-\d{4})?$/, hint: "US ZIP codes are 5 digits (e.g. 90210)." },
  CA: { regex: /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/, hint: "Canadian codes look like A1A 1A1." },
  GB: { regex: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, hint: "UK postcodes look like SW1A 1AA." },
  DE: { regex: /^\d{5}$/, hint: "German postal codes are 5 digits." },
  FR: { regex: /^\d{5}$/, hint: "French postal codes are 5 digits." },
  EG: { regex: /^\d{5}$/, hint: "Egyptian postal codes are 5 digits." },
  IN: { regex: /^\d{6}$/, hint: "Indian PIN codes are 6 digits." },
  CN: { regex: /^\d{6}$/, hint: "Chinese postal codes are 6 digits." },
  JP: { regex: /^\d{3}-?\d{4}$/, hint: "Japanese postal codes look like 100-0001." },
  AU: { regex: /^\d{4}$/, hint: "Australian postcodes are 4 digits." },
  NL: { regex: /^\d{4}\s?[A-Za-z]{2}$/, hint: "Dutch codes look like 1011 AB." },
  ES: { regex: /^\d{5}$/, hint: "Spanish postal codes are 5 digits." },
  IT: { regex: /^\d{5}$/, hint: "Italian postal codes are 5 digits." },
};

// KSA National Address short code: 4 letters + 4 digits (e.g. RCTB4359).
const SA_SHORT_ADDRESS_REGEX = /^[A-Za-z]{4}\d{4}$/;

function postalFormatError(countryCode: string, postalCode: string): string | null {
  const fmt = POSTAL_FORMATS[countryCode?.toUpperCase()];
  if (!fmt) return null;
  return fmt.regex.test((postalCode || "").trim()) ? null : fmt.hint;
}

const packageTypes = [
  { value: "YOUR_PACKAGING", label: "Your Own Packaging" },
  { value: "FEDEX_ENVELOPE", label: "FedEx Envelope" },
  { value: "FEDEX_PAK", label: "FedEx Pak" },
  { value: "FEDEX_BOX", label: "FedEx Box" },
  { value: "FEDEX_SMALL_BOX", label: "FedEx Small Box" },
  { value: "FEDEX_MEDIUM_BOX", label: "FedEx Medium Box" },
  { value: "FEDEX_LARGE_BOX", label: "FedEx Large Box" },
  { value: "FEDEX_10KG_BOX", label: "FedEx 10kg Box" },
  { value: "FEDEX_25KG_BOX", label: "FedEx 25kg Box" },
  { value: "FEDEX_TUBE", label: "FedEx Tube" },
];

const packageTypeLabels: Record<string, string> = Object.fromEntries(
  packageTypes.map(p => [p.value, p.label])
);

const carriers = [
  { code: "FEDEX", name: "FedEx" },
  { code: "DHL", name: "DHL" },
  { code: "ARAMEX", name: "Aramex" },
];

function CarrierMark({ carrierCode }: { carrierCode: string }) {
  return <CarrierLogo carrierCode={carrierCode} />;
}

function titleCaseLabel(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAddressBookOptionLabel(entry: AddressBookEntry): string {
  const locationParts = [entry.city?.trim(), entry.countryCode?.trim().toUpperCase()].filter(Boolean);
  if (entry.source === "default_shipping") {
    return `${entry.label}${locationParts.length ? ` — ${locationParts.join(", ")}` : ""}`;
  }
  return entry.label;
}

function formatRateServiceMeta(serviceType: string, serviceName: string): string | null {
  const trimmedServiceType = serviceType.trim();
  if (!trimmedServiceType) {
    return null;
  }

  if (/^[A-Z0-9]{1,4}$/.test(trimmedServiceType)) {
    return `Service code ${trimmedServiceType}`;
  }

  const normalized = titleCaseLabel(trimmedServiceType.replace(/_/g, " "));
  const normalizedName = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedMeta = normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (!normalizedMeta || normalizedName.includes(normalizedMeta)) {
    return null;
  }

  return normalized;
}

// Express is international only — domestic goes through the Local flow. Inbound/outbound are
// shown to the client as Import/Export.
const shipmentTypeOptions = [
  { value: "inbound", label: "Import", description: "International shipping into a country" },
  { value: "outbound", label: "Export", description: "International shipping out of a country" },
];


interface MyPermissions {
  permissions: string[];
  isPrimaryContact: boolean;
}

// Module-level so its identity is stable across renders. Defining this inside the component
// made React treat it as a new component type on every keystroke, remounting the whole form
// and dropping input focus after each character.
function QuoteShell({ quoteMode, profile, children }: { quoteMode: boolean; profile?: string | null; children: React.ReactNode }) {
  return quoteMode ? <>{children}</> : <ClientLayout clientProfile={profile ?? undefined}>{children}</ClientLayout>;
}

// Express shipments are booked for a carrier pickup automatically. Keep PICKUP_CUTOFF_HOUR in
// sync with the server (routes.ts). Before the cutoff on a business day → same-day pickup;
// otherwise the next business day. KSA weekend = Friday & Saturday.
const PICKUP_CUTOFF_HOUR = 15; // 24h, KSA local
function isKsaWeekendDow(dow: number): boolean {
  return dow === 5 || dow === 6;
}
function computeDefaultPickup(now: Date = new Date()): { date: string; sameDay: boolean } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const cur = new Date(Date.UTC(y, m - 1, d));
  if (hour < PICKUP_CUTOFF_HOUR && !isKsaWeekendDow(cur.getUTCDay())) {
    return { date: cur.toISOString().slice(0, 10), sameDay: true };
  }
  do { cur.setUTCDate(cur.getUTCDate() + 1); } while (isKsaWeekendDow(cur.getUTCDay()));
  return { date: cur.toISOString().slice(0, 10), sameDay: false };
}

export default function CreateShipment() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  // Dangerous goods is picked on the "Create a shipment" chooser, exactly like Local,
  // Express and Door To Door. `?dg=1` is that choice arriving here — it is not a mode the
  // client can switch on halfway through, because it changes what we quote.
  const isDangerousGoodsFlow = new URLSearchParams(searchString).get("dg") === "1";
  const { toast } = useToast();
  // Admin quotation mode — when present, this same flow is being used by an admin to build a
  // quote for the selected client; endpoints swap to admin on-behalf-of variants and the final
  // step Sends the quote instead of Pay. When null, behaviour is the normal client flow.
  const quotation = useQuotationMode();
  const quoteMode = Boolean(quotation);
  const [step, setStep] = useState(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [rates, setRates] = useState<RatesResponse | null>(null);
  // Quotation mode: maps a rate row's synthetic quoteId → the admin option (carrier + base rate).
  const [adminRateOptions, setAdminRateOptions] = useState<Record<string, { carrierCode?: string; serviceType?: string; serviceName: string; baseRate: number }>>({});
  const [quotationSent, setQuotationSent] = useState<{ trackingNumber: string } | null>(null);
  // Admin quotation discount (percent of total, or a fixed SAR amount off the client total).
  const [quoteDiscountType, setQuoteDiscountType] = useState<"percent" | "fixed">("fixed");
  const [quoteDiscountValue, setQuoteDiscountValue] = useState<number>(0);
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmResponse | null>(null);
  // Carrier pickup — express shipments are ALWAYS booked for pickup. `custom` = the client chose
  // a specific date/window instead of the automatic cutoff-based default.
  const [pickup, setPickup] = useState({ custom: false, date: "", readyTime: "09:00", closeTime: "17:00", location: "", instructions: "" });
  // Dedupe guards for step navigation. Declared at the top (before any early return) so the
  // hook order is stable — placing useRef after the access-denied early return crashed the
  // page with "Rendered more hooks than during the previous render."
  const lastCheckoutSignatureRef = useRef<string | null>(null);
  const lastRatesSignatureRef = useRef<string | null>(null);
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);

  // Guest mode: the whole wizard runs, rates are live, and the wall is at payment.
  const { isGuest } = useGuestMode();
  // The price the visitor was shown before they had an account. Kept so that after they
  // register we can show what changed rather than silently moving the number under them.
  const [indicativeQuote, setIndicativeQuote] = useState<GuestIndicativeQuote | null>(null);
  const hydratedDraftRef = useRef(false);

  const [formData, setFormData] = useState<ShipmentFormData>({
    shipmentType: "" as "domestic" | "inbound" | "outbound",
    isDdp: false,
    carrier: "",
    serviceType: "",
    shipper: {
      name: "",
      company: "",
      phone: "",
      email: "",
      countryCode: "",
      city: "",
      postalCode: "",
      addressLine1: "",
      addressLine2: "",
      stateOrProvince: "",
      shortAddress: "",
    },
    recipient: {
      name: "",
      company: "",
      phone: "",
      email: "",
      countryCode: "",
      city: "",
      postalCode: "",
      addressLine1: "",
      addressLine2: "",
      stateOrProvince: "",
      shortAddress: "",
    },
    packages: [
      { weight: 1, length: 10, width: 10, height: 10 },
    ],
    items: [{ ...defaultItem }],
    tradeDocuments: [],
    hasDangerousGoods: isDangerousGoodsFlow,
    dangerousGoods: { ...defaultDangerousGoods },
    dangerousGoodsDocuments: [],
    weightUnit: "KG",
    dimensionUnit: "CM",
    packageType: "YOUR_PACKAGING",
    currency: "SAR",
  });

  const [hsLookupLoading, setHsLookupLoading] = useState<Record<number, boolean>>({});
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<ItemFormData>({ ...defaultItem });
  const [customsInputMode, setCustomsInputMode] = useState<"invoice" | "manual">("manual");
  const [invoiceExtractionSummary, setInvoiceExtractionSummary] = useState<InvoiceExtractionResponse["summary"] | null>(null);
  const [isExtractingInvoice, setIsExtractingInvoice] = useState(false);
  const [isExtractingDangerousGoods, setIsExtractingDangerousGoods] = useState(false);
  const [dangerousGoodsExtraction, setDangerousGoodsExtraction] =
    useState<DangerousGoodsExtractionResponse | null>(null);
  const [packageListDocument, setPackageListDocument] = useState<{
    fileName: string;
    objectPath: string;
    contentType: string;
    size: number;
  } | null>(null);
  const [packageExtractionSummary, setPackageExtractionSummary] = useState<PackageExtractionResponse["summary"] | null>(null);
  const [isExtractingPackageList, setIsExtractingPackageList] = useState(false);

  const { uploadFile: uploadInvoiceFile, isUploading: isUploadingInvoice } = useUpload({
    onError: (error) => {
      toast({
        title: "Invoice upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { uploadFile: uploadDangerousGoodsFile, isUploading: isUploadingDangerousGoodsDoc } = useUpload({
    onError: (error) => {
      toast({
        title: "Document upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { uploadFile: uploadPackageListFile, isUploading: isUploadingPackageList } = useUpload({
    onError: (error) => {
      toast({
        title: "Packing list upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: account } = useQuery<ClientAccount>({
    queryKey: [quoteMode ? `/api/admin/quotations/client/${quotation!.clientAccountId}` : "/api/client/account"],
  });

  // Helper function to create address from account's default shipping address
  const getAccountShippingAddress = () => {
    if (!account) return null;
    return {
      name: account.shippingContactName || account.name || "",
      // For company accounts, pre-fill the sender company from the account.
      company: account.accountType === "company" ? (account.companyName || "") : "",
      phone: account.shippingContactPhone || account.phone || "",
      countryCode: account.shippingCountryCode || "",
      stateOrProvince: (account as any).shippingStateOrProvince || "",
      city: account.shippingCity || "",
      postalCode: account.shippingPostalCode || "",
      addressLine1: account.shippingAddressLine1 || "",
      addressLine2: account.shippingAddressLine2 || "",
      shortAddress: account.shippingShortAddress || "",
    };
  };

  // Auto-populate addresses when account data loads (handles async fetch case)
  // Use functional update to avoid stale closure issues with formData
  useEffect(() => {
    if (!account) return;
    
    const accountAddress = getAccountShippingAddress();
    if (!accountAddress) return;
    
    setFormData(prev => {
      if (!prev.shipmentType) return prev;
      
      // Only auto-populate if the addresses are still empty (user hasn't manually entered data)
      const isShipperEmpty = !prev.shipper.name && !prev.shipper.addressLine1;
      const isRecipientEmpty = !prev.recipient.name && !prev.recipient.addressLine1;
      
      if (prev.shipmentType === "domestic") {
        if (isShipperEmpty && isRecipientEmpty) {
          return {
            ...prev,
            shipper: { ...accountAddress, countryCode: "SA" },
            recipient: { ...accountAddress, countryCode: "SA" },
          };
        }
      } else if (prev.shipmentType === "inbound") {
        if (isRecipientEmpty) {
          return {
            ...prev,
            recipient: { ...accountAddress },
          };
        }
      } else if (prev.shipmentType === "outbound") {
        if (isShipperEmpty) {
          return {
            ...prev,
            shipper: { ...accountAddress },
          };
        }
      }
      return prev;
    });
  }, [account]);

  // Handle payment return flow
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const shipmentId = params.get("shipmentId");
    const paymentStatus = params.get("paymentStatus");
    const message = params.get("message");

    if (shipmentId && paymentStatus && !isProcessingCallback) {
      setIsProcessingCallback(true);

      if (paymentStatus === "success") {
        // Payment was successful, confirm the shipment
        toast({
          title: "Payment Successful",
          description: "Completing your shipment...",
        });
        
        // Trigger the confirm mutation - navigation happens in onSuccess/onError
        confirmMutation.mutate({
          shipmentId,
          paymentIntentId: undefined,
        });
      } else if (paymentStatus === "failed") {
        toast({
          title: "Payment Failed",
          description: message || "Your payment could not be processed. Please try again.",
          variant: "destructive",
        });
        navigate("/client/shipments", { replace: true });
      } else if (paymentStatus === "pending") {
        toast({
          title: "Payment Pending",
          description: "Your payment is being processed. Please wait.",
        });
        navigate("/client/shipments", { replace: true });
      }
    }
  }, [searchString, isProcessingCallback, toast]);

  const getRatesMutation = useMutation({
    mutationFn: async (data: ShipmentFormData) => {
      if (quoteMode) {
        // Admin on-behalf rates → live carrier options for the selected client.
        const res = await apiRequest("POST", "/api/admin/quotations/rates", {
          clientAccountId: quotation!.clientAccountId,
          type: "express",
          shipper: { ...data.shipper, addressLine2: data.shipper.addressLine2 || "", shortAddress: data.shipper.shortAddress || "" },
          recipient: { ...data.recipient, addressLine2: data.recipient.addressLine2 || "", shortAddress: data.recipient.shortAddress || "" },
          packages: data.packages,
          weightUnit: data.weightUnit,
          dimensionUnit: data.dimensionUnit,
        });
        const body = await res.json() as { options: Array<{ carrierCode?: string; carrierName?: string; serviceType?: string; serviceName: string; baseRate: number; clientTotal: number; transitDays?: number | null }> };
        const map: Record<string, { carrierCode?: string; serviceType?: string; serviceName: string; baseRate: number }> = {};
        const quotes: RateQuote[] = body.options.map((o, i) => {
          const quoteId = `q${i}`;
          map[quoteId] = { carrierCode: o.carrierCode, serviceType: o.serviceType, serviceName: o.serviceName, baseRate: o.baseRate };
          return {
            quoteId, carrierCode: o.carrierCode || "", carrierName: o.carrierName || o.serviceName,
            serviceType: o.serviceType || "", serviceName: o.serviceName,
            finalPrice: o.clientTotal, currency: "SAR", transitDays: Number(o.transitDays ?? 0),
          };
        });
        setAdminRateOptions(map);
        return { quotes, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), availableCarriers: [] } as RatesResponse;
      }
      const payload = {
        shipmentType: data.shipmentType,
        isDdp: data.isDdp,
        shipper: data.shipper,
        recipient: data.recipient,
        packages: data.packages,
        weightUnit: data.weightUnit,
        dimensionUnit: data.dimensionUnit,
        packageType: data.packageType,
        currency: data.currency,
        // Sent at rate time on purpose: the carrier only includes its dangerous goods
        // surcharge in a quote that declares the goods.
        ...(data.hasDangerousGoods ? { dangerousGoods: toDangerousGoodsPayload(data.dangerousGoods) } : {}),
      };
      // Guests have no account, so they cannot use the client rate endpoint (and nothing is
      // persisted for them). The public endpoint prices at the standard individual rate and
      // returns the same shape, flagged indicative.
      const ratesEndpoint = isGuest ? "/api/public/guest/express-rates" : "/api/client/shipments/rates";
      const res = await apiRequest("POST", ratesEndpoint, payload);
      return res.json() as Promise<RatesResponse>;
    },
    onSuccess: (data) => {
      setSelectedQuoteId(null);
      setRates(data);
      setCheckoutData(null);
      setConfirmData(null);
      setStep(rateStep);
    },
    onError: (error) => {
      toast({
        title: "We couldn't get rates for this shipment",
        description: humanizeError(error),
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (payload: {
      quoteId: string;
      items?: Array<{
        itemName: string;
        itemDescription?: string;
        category: string;
        material?: string;
        countryOfOrigin: string;
        hsCode?: string;
        hsCodeSource?: HsCodeSourceValue;
        hsCodeConfidence?: HsCodeConfidenceValue;
        hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
        price: number;
        currency?: string;
        quantity: number;
      }>;
      tradeDocuments?: ShipmentTradeDocument[];
      pickup?: { requested: boolean; date?: string; readyTime?: string; closeTime?: string; location?: string; instructions?: string };
    }) => {
      if (quoteMode) {
        // Admin quotation: create the payment_pending quote for the client + notify them.
        const opt = payload.quoteId ? adminRateOptions[payload.quoteId] : undefined;
        const res = await apiRequest("POST", "/api/admin/quotations", {
          clientAccountId: quotation!.clientAccountId,
          type: "express",
          shipper: { ...formData.shipper, addressLine2: formData.shipper.addressLine2 || "", shortAddress: formData.shipper.shortAddress || "" },
          recipient: { ...formData.recipient, addressLine2: formData.recipient.addressLine2 || "", shortAddress: formData.recipient.shortAddress || "" },
          packages: formData.packages,
          weightUnit: formData.weightUnit,
          dimensionUnit: formData.dimensionUnit,
          currency: formData.currency,
          carrierCode: opt?.carrierCode,
          serviceType: opt?.serviceType,
          serviceName: opt?.serviceName,
          baseRateSar: opt?.baseRate,
          items: payload.items,
          tradeDocuments: payload.tradeDocuments,
          pickup: payload.pickup,
          ...(quoteDiscountValue > 0
            ? { discountType: quoteDiscountType, discountValue: quoteDiscountValue }
            : {}),
          sendNotification: true,
        });
        return res.json() as Promise<CheckoutResponse>;
      }
      const res = await apiRequest("POST", "/api/client/shipments/checkout", payload);
      return res.json() as Promise<CheckoutResponse>;
    },
    onSuccess: (data) => {
      if (quoteMode) {
        setQuotationSent({ trackingNumber: (data as any).trackingNumber || "" });
        setStep(confirmationStep);
        return;
      }
      setCheckoutData(data);
      queryClient.invalidateQueries({ queryKey: ["/api/client/address-book"] });
      setStep(paymentStep);
    },
    onError: (error) => {
      toast({
        title: "Failed to process checkout",
        description: humanizeError(error),
        variant: "destructive",
      });
    },
  });

  const createShipmentPaymentMutation = useMutation({
    mutationFn: async (payload: {
      shipmentId: string;
      tapTokenId?: string;
      saveCardForFuture?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/client/shipments/pay", {
        ...payload,
        returnPath: "/client/create-shipment",
      });
      return res.json() as Promise<ShipmentPaymentResponse>;
    },
    onSuccess: (data) => {
      if (data.transactionUrl) {
        window.location.href = data.transactionUrl;
        return;
      }

      if (["CAPTURED", "AUTHORIZED"].includes(String(data.paymentStatus || "").toUpperCase())) {
        toast({
          title: "Payment Successful",
          description: "Completing your shipment...",
        });
        confirmMutation.mutate({
          shipmentId: data.shipmentId,
          paymentIntentId: data.paymentId,
        });
        return;
      }

      toast({
        title: "Payment initiated",
        description: "Your payment is being processed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Payment Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (params: { shipmentId: string; paymentIntentId?: string }) => {
      const res = await apiRequest("POST", "/api/client/shipments/confirm", params);
      return res.json() as Promise<ConfirmResponse>;
    },
    onSuccess: (data) => {
      setConfirmData(data);
      setStep(confirmationStep);
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
      // Clear URL params after successful confirmation
      navigate("/client/create-shipment", { replace: true });
    },
    onError: (error: any) => {
      const is502 = error?.status === 502 || (error instanceof Error && error.message?.includes("carrier"));
      toast({
        title: is502 ? "Carrier Error" : "Failed to confirm shipment",
        description: is502
          ? "The carrier could not process this shipment. Please retry or contact support."
          : (humanizeError(error)),
        variant: "destructive",
      });
      navigate("/client/shipments", { replace: true });
    },
  });

  const payLaterMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      const res = await apiRequest("POST", `/api/client/shipments/${shipmentId}/pay-later`);
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmData({
        shipment: data.shipment,
        carrierTrackingNumber: data.carrierTrackingNumber || "",
        labelUrl: data.labelUrl,
        estimatedDelivery: data.estimatedDelivery,
      });
      setStep(confirmationStep);
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/credit-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/payments"] });
      toast({
        title: "Credit Invoice Created",
        description: "Your shipment has been created with Pay Later. Invoice due in 30 days.",
      });
    },
    onError: (error: any) => {
      const is502 = error?.status === 502 || (error instanceof Error && error.message?.includes("carrier"));
      toast({
        title: is502 ? "Carrier Error" : "Failed to process Pay Later",
        description: is502
          ? "The carrier could not process this shipment. Please retry or contact support."
          : (humanizeError(error)),
        variant: "destructive",
      });
    },
  });

  const { data: myPerms, isLoading: permsLoading } = useQuery<MyPermissions>({
    queryKey: ["/api/client/my-permissions"],
  });

  // In admin quotation mode the admin route already gates access; the client permission query
  // doesn't apply, so treat creation as allowed.
  const canCreateShipments = quoteMode || myPerms?.isPrimaryContact || myPerms?.permissions.includes("create_shipments");

  const { data: addressBookEntries = [] } = useQuery<AddressBookEntry[]>({
    // In admin quotation mode, load the TARGET client's address book (same saved addresses the
    // client sees), not the admin's.
    queryKey: quoteMode
      ? [`/api/admin/quotations/client/${quotation!.clientAccountId}/address-book`]
      : ["/api/client/address-book"],
    enabled: !!canCreateShipments,
  });

  const { data: creditAccess } = useQuery<{ creditEnabled: boolean; request: any }>({
    queryKey: ["/api/client/credit-access"],
  });

  // Gates the whole dangerous goods flow. Off unless an admin approved this account, so a
  // client who has not been through DG onboarding never sees the option.
  const { data: dangerousGoodsAccess } = useQuery<{ enabled: boolean; request: any }>({
    queryKey: ["/api/client/dangerous-goods"],
  });

  const invoiceDocument = formData.tradeDocuments[0] ?? null;
  const isInternationalShipment =
    formData.shipmentType === "inbound" || formData.shipmentType === "outbound";
  // Step numbering is computed, not hardcoded, because the dangerous goods step only exists
  // when the client declares regulated goods — and it has to come BEFORE rates, since the
  // carrier's dangerous goods surcharge is only in a quote that declares them.
  // The declaration is three steps, not one: pick what you're shipping, hand us the safety
  // data sheet, then check what we read off it. Asking a shipper to fill a blank IATA form
  // is what makes dangerous goods hard, so the form arrives mostly filled in.
  const dangerousGoodsContentStep = 5;
  const dangerousGoodsDocumentsStep = 6;
  const showDangerousGoodsStep = isDangerousGoodsFlow;
  // A dangerous goods shipment is never priced in this wizard. Carriage is arranged with the
  // carrier by email, so there is no rate to select and nothing to pay for yet — the flow ends
  // at a submission, and the price arrives later as a quotation from operations. `rateStep` is
  // -1 rather than a real number so any stale comparison against it simply never matches.
  const rateStep = showDangerousGoodsStep ? -1 : 5;
  const lastStepBeforeRoute = showDangerousGoodsStep ? dangerousGoodsDocumentsStep : rateStep;
  const customsStep = lastStepBeforeRoute + 1; // international only
  const stepAfterRoute = isInternationalShipment ? customsStep + 1 : lastStepBeforeRoute + 1;
  // Dangerous goods has no pickup step. Nobody knows when the goods can be collected until the
  // carrier has accepted the declaration and said so — asking the client to choose a date here
  // would be asking them to guess at an answer only DHL or FedEx can give, days later. The
  // collection date is agreed by operations during the handover and recorded with the quote.
  const pickupStep = showDangerousGoodsStep ? -1 : stepAfterRoute;
  const dangerousGoodsSubmitStep = showDangerousGoodsStep ? stepAfterRoute : -1;
  const paymentStep = showDangerousGoodsStep ? -1 : pickupStep + 1;
  const confirmationStep = showDangerousGoodsStep ? dangerousGoodsSubmitStep + 1 : paymentStep + 1;
  const selectedQuote = rates?.quotes.find((quote) => quote.quoteId === selectedQuoteId) ?? null;
  const selectedCarrierCode = selectedQuote?.carrierCode || formData.carrier || "";
  const checkoutExtraChargeableWeight = Math.max(
    0,
    Number(checkoutData?.chargeableWeight || 0) - Number(checkoutData?.actualWeight || 0),
  );
  const checkoutExtraKgCharge =
    checkoutData?.chargeableWeight && checkoutData.chargeableWeight > 0
      ? checkoutExtraChargeableWeight * (checkoutData.amount / checkoutData.chargeableWeight)
      : 0;
  const checkoutActualPackageCount = checkoutData?.chargeableActualPackageCount ?? 0;
  const checkoutDimensionalPackageCount = checkoutData?.chargeableDimensionalPackageCount ?? 0;
  const chargeableWeightSummary = calculateChargeableWeight(
    formData.packages,
    formData.weightUnit,
    formData.dimensionUnit,
    selectedCarrierCode || "GENERIC",
  );
  const dimensionalPackageCount = chargeableWeightSummary.packages.filter((pkg) => pkg.usesDimensionalWeight).length;
  const actualPackageCount = Math.max(chargeableWeightSummary.packages.length - dimensionalPackageCount, 0);
  const displayedCarriers = rates?.availableCarriers?.length
    ? rates.availableCarriers
    : carriers.filter((carrier) =>
        rates ? rates.quotes.some((quote) => quote.carrierCode === carrier.code) : true,
      );

  const shipperAddressOptions = addressBookEntries
    .filter((entry) => entry.useForShipper)
    .filter((entry) => formData.shipmentType !== "domestic" || entry.countryCode === "SA")
    .map((entry) => ({
      value: entry.id,
      label: formatAddressBookOptionLabel(entry),
    }));

  const recipientAddressOptions = addressBookEntries
    .filter((entry) => entry.useForRecipient)
    .filter((entry) => formData.shipmentType !== "domestic" || entry.countryCode === "SA")
    .map((entry) => ({
      value: entry.id,
      label: formatAddressBookOptionLabel(entry),
    }));

  useEffect(() => {
    if (!selectedQuote) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      carrier: selectedQuote.carrierCode,
      serviceType: selectedQuote.serviceType,
    }));
  }, [selectedQuote]);

  // ── Dangerous goods: submit, unpriced ──────────────────────────────────────────
  //
  // No rate, no checkout, no payment. The declaration goes to operations, who arrange
  // carriage with the carrier by email and come back with a quotation the client can pay.
  const [dangerousGoodsSubmission, setDangerousGoodsSubmission] = useState<{
    shipmentId: string;
    trackingNumber: string;
  } | null>(null);

  const dangerousGoodsSubmitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        shipmentType: formData.shipmentType,
        shipper: formData.shipper,
        recipient: formData.recipient,
        packages: formData.packages.map((pkg) => ({
          weight: Number(pkg.weight),
          length: Number(pkg.length),
          width: Number(pkg.width),
          height: Number(pkg.height),
        })),
        weightUnit: formData.weightUnit,
        dimensionUnit: formData.dimensionUnit,
        packageType: formData.packageType,
        currency: formData.currency,
        dangerousGoods: toDangerousGoodsPayload(formData.dangerousGoods),
        dangerousGoodsDocuments: formData.dangerousGoodsDocuments,
        ...(isInternationalShipment
          ? {
              items: formData.items
                .filter((item) => item.itemName.trim() !== "")
                .map((item) => ({
                  itemName: item.itemName,
                  itemDescription: item.itemDescription || undefined,
                  category: item.category,
                  material: item.material || undefined,
                  countryOfOrigin: item.countryOfOrigin,
                  hsCode: item.hsCode || undefined,
                  hsCodeSource: item.hsCodeSource || undefined,
                  hsCodeConfidence: item.hsCodeConfidence || undefined,
                  hsCodeCandidates: item.hsCodeCandidates.length > 0 ? item.hsCodeCandidates : undefined,
                  price: item.price,
                  currency: item.currency,
                  quantity: item.quantity,
                })),
              tradeDocuments: customsInputMode === "invoice" ? formData.tradeDocuments : [],
            }
          : {}),
      };
      const res = await apiRequest("POST", "/api/client/shipments/dangerous-goods", payload);
      return (await res.json()) as { shipmentId: string; trackingNumber: string };
    },
    onSuccess: (data) => {
      setDangerousGoodsSubmission(data);
      setStep(confirmationStep);
    },
    onError: (error) => {
      toast({
        title: "We couldn't submit this declaration",
        description: humanizeError(error),
        variant: "destructive",
      });
    },
  });

  // `?dg=1` is a URL, so it can be typed. The server refuses the quote anyway (403), but
  // sending the client back to the chooser is a better answer than letting them fill in a
  // declaration and hit a wall at the rate step.
  useEffect(() => {
    if (!isDangerousGoodsFlow || quoteMode) return;
    if (dangerousGoodsAccess && !dangerousGoodsAccess.enabled) {
      toast({
        title: "Dangerous goods needs approval first",
        description: "Request access from the Create a shipment page and we'll review it.",
        variant: "destructive",
      });
      navigate("/client/shipments/new");
    }
  }, [dangerousGoodsAccess, isDangerousGoodsFlow, quoteMode, navigate, toast]);

  // Permission check - show access denied if user lacks create_shipments permission
  // Pick up a shipment that was built before this visitor had an account.
  //
  // Must sit above every early return in this component. Below the `permsLoading` guard it is
  // skipped on the first render and runs on the second, which changes the hook count and
  // crashes the whole wizard with "Rendered more hooks than during the previous render".
  //
  // Two sources, one behaviour: individuals come straight back with the draft still in their
  // browser, companies come back days later after approval with it held on their application.
  // Either way the draft is only form input — it is re-rated against the real account here, so
  // the price they pay is their price, not the indicative individual rate they were shown.
  useEffect(() => {
    if (isGuest || quoteMode || hydratedDraftRef.current) return;
    // A Tap redirect owns this render; the shipment already exists by then.
    if (new URLSearchParams(searchString).get("shipmentId")) return;

    let cancelled = false;

    const hydrate = (draft: { kind?: string; formData?: unknown; indicativeQuote?: GuestIndicativeQuote } | null | undefined) => {
      if (!draft || draft.kind !== "express" || !draft.formData) return false;
      hydratedDraftRef.current = true;
      const draftForm = draft.formData as ShipmentFormData;
      setFormData(draftForm);
      setIndicativeQuote(draft.indicativeQuote ?? null);
      lastRatesSignatureRef.current = null;
      lastCheckoutSignatureRef.current = null;
      getRatesMutation.mutate(draftForm);
      toast({
        title: "Your shipment is back",
        description: "We're re-checking the price against your account before you pay.",
      });
      return true;
    };

    if (hydrate(consumeGuestDraft())) return;

    (async () => {
      const draft = await fetchPendingShipmentDraft();
      if (cancelled) return;
      if (hydrate(draft)) {
        // Clear it server-side too, so it is offered exactly once.
        await dismissPendingShipmentDraft();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, quoteMode, searchString]);

  if (permsLoading) {
    return <LoadingScreen />;
  }

  // In quotation mode the admin page supplies the layout; otherwise use ClientLayout.
  if (!canCreateShipments) {
    return (
      <ClientLayout>
        <div className="p-6">
          <Card>
            <CardContent className="py-16 text-center">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-medium">Access Denied</h2>
              <p className="mt-2 text-muted-foreground">
                You don't have permission to create shipments.
              </p>
              <Button className="mt-4" onClick={() => navigate("/client/dashboard")}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    );
  }

  const updateShipper = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      shipper: { ...prev.shipper, [field]: value },
    }));
  };

  const updateRecipient = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      recipient: { ...prev.recipient, [field]: value },
    }));
  };

  // Fill city + postal (+ state when empty) from a picked city/postal suggestion.
  const pickShipperGeo = (s: GeoSuggestion) => {
    setFormData(prev => ({
      ...prev,
      shipper: {
        ...prev.shipper,
        city: s.city,
        postalCode: s.postalCode,
        stateOrProvince: prev.shipper.stateOrProvince || s.state || "",
      },
    }));
  };
  const pickRecipientGeo = (s: GeoSuggestion) => {
    setFormData(prev => ({
      ...prev,
      recipient: {
        ...prev.recipient,
        city: s.city,
        postalCode: s.postalCode,
        stateOrProvince: prev.recipient.stateOrProvince || s.state || "",
      },
    }));
  };

  const applySavedAddress = (party: "shipper" | "recipient", entryId: string) => {
    const entry = addressBookEntries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    const nextAddress = {
      name: entry.name,
      phone: entry.phone,
      email: entry.email || "",
      countryCode: formData.shipmentType === "domestic" ? "SA" : entry.countryCode,
      city: entry.city,
      postalCode: entry.postalCode || "",
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2 || "",
      stateOrProvince: entry.stateOrProvince || "",
      shortAddress: entry.shortAddress || "",
    };

    setFormData((prev) =>
      party === "shipper"
        ? { ...prev, shipper: nextAddress }
        : { ...prev, recipient: nextAddress },
    );

    toast({
      title: party === "shipper" ? "Sender details filled" : "Recipient details filled",
      description: `We filled the form using ${entry.label.toLowerCase()}.`,
    });
  };

  const updatePackageItem = (index: number, field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      packages: prev.packages.map((pkg, i) => i === index ? { ...pkg, [field]: value } : pkg),
    }));
  };

  const addPackage = () => {
    setFormData(prev => ({
      ...prev,
      packages: [...prev.packages, { weight: 1, length: 10, width: 10, height: 10 }],
    }));
  };

  const removePackage = (index: number) => {
    if (formData.packages.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      packages: prev.packages.filter((_, i) => i !== index),
    }));
  };

  const updateSharedPackageSetting = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const clearPackageListDocument = () => {
    setPackageListDocument(null);
    setPackageExtractionSummary(null);
  };

  const handlePackageListSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const normalizedContentType = normalizeTradeDocumentContentType(file.type, file.name);
    if (!SUPPORTED_PACKAGE_LIST_CONTENT_TYPES.has(normalizedContentType)) {
      toast({
        title: "Unsupported packing list format",
        description: "Upload a PDF, DOCX, XLS, XLSX, TXT, JPG, JPEG, PNG, or GIF packing list.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      toast({
        title: "Packing list is too large",
        description: `The packing list exceeds the ${Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB limit.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const fileForUpload = file.type === normalizedContentType
      ? file
      : new File([file], file.name, {
          type: normalizedContentType,
          lastModified: file.lastModified,
        });

    const uploadResponse = await uploadPackageListFile(fileForUpload);
    if (!uploadResponse) {
      e.target.value = "";
      return;
    }

    setIsExtractingPackageList(true);

    try {
      const extractionRes = await apiRequest(
        "POST",
        quoteMode ? "/api/admin/quotations/extract-package-details" : "/api/client/shipments/extract-package-details",
        {
          ...(quoteMode ? { clientAccountId: quotation!.clientAccountId, shipperCountryCode: formData.shipper.countryCode, recipientCountryCode: formData.recipient.countryCode, shipmentType: formData.shipmentType } : {}),
          fileName: uploadResponse.metadata.name,
          objectPath: uploadResponse.objectPath,
          contentType: normalizeTradeDocumentContentType(
            uploadResponse.metadata.contentType,
            uploadResponse.metadata.name,
          ),
        },
      );

      const extraction = await extractionRes.json() as PackageExtractionResponse;
      const extractedPackages = extraction.packages.map((pkg, index) => ({
        reference: pkg.packageNumber || String(index + 1),
        weight: pkg.weight,
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
      }));

      setFormData((prev) => ({
        ...prev,
        packages: extractedPackages.length > 0 ? extractedPackages : prev.packages,
        weightUnit: extraction.detectedWeightUnit,
        dimensionUnit: extraction.detectedDimensionUnit,
        packageType: "YOUR_PACKAGING",
      }));
      setPackageListDocument({
        fileName: uploadResponse.metadata.name,
        objectPath: uploadResponse.objectPath,
        contentType: normalizeTradeDocumentContentType(
          uploadResponse.metadata.contentType,
          uploadResponse.metadata.name,
        ),
        size: uploadResponse.metadata.size,
      });
      setPackageExtractionSummary(extraction.summary);

      toast({
        title: "Packing list processed",
        description: `${extractedPackages.length} package${extractedPackages.length === 1 ? "" : "s"} imported.`,
      });
    } catch (error) {
      setPackageListDocument(null);
      setPackageExtractionSummary(null);
      toast({
        title: "Could not process packing list",
        description: error instanceof Error ? error.message : "Please upload another file or enter the packages manually.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingPackageList(false);
      e.target.value = "";
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { ...defaultItem }],
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => {
      const remaining = prev.items.filter((_, i) => i !== index);
      return {
        ...prev,
        items: remaining.length === 0 ? [{ ...defaultItem }] : remaining,
      };
    });
  };

  const clearInvoiceDocument = () => {
    setFormData((prev) => ({
      ...prev,
      tradeDocuments: [],
      items: [{ ...defaultItem }],
    }));
    setInvoiceExtractionSummary(null);
  };

  const handleInvoiceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const normalizedContentType = normalizeTradeDocumentContentType(file.type, file.name);
    if (!SUPPORTED_INVOICE_CONTENT_TYPES.has(normalizedContentType)) {
      toast({
        title: "Unsupported invoice format",
        description: "Upload a PDF, DOCX, XLS, XLSX, TXT, JPG, JPEG, PNG, or GIF invoice.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      toast({
        title: "Invoice is too large",
        description: `The invoice exceeds the ${Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB limit.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const fileForUpload = file.type === normalizedContentType
      ? file
      : new File([file], file.name, {
          type: normalizedContentType,
          lastModified: file.lastModified,
        });

    const uploadResponse = await uploadInvoiceFile(fileForUpload);
    if (!uploadResponse) {
      e.target.value = "";
      return;
    }

    setIsExtractingInvoice(true);

    try {
      const extractionRes = await apiRequest(
        "POST",
        quoteMode ? "/api/admin/quotations/extract-invoice-items" : "/api/client/shipments/extract-invoice-items",
        {
          ...(quoteMode ? { clientAccountId: quotation!.clientAccountId } : {}),
          shipmentType: formData.shipmentType,
          shipperCountryCode: formData.shipper.countryCode,
          recipientCountryCode: formData.recipient.countryCode,
          fileName: uploadResponse.metadata.name,
          objectPath: uploadResponse.objectPath,
          contentType: normalizeTradeDocumentContentType(
            uploadResponse.metadata.contentType,
            uploadResponse.metadata.name,
          ),
        },
      );

      const extraction = await extractionRes.json() as InvoiceExtractionResponse;
      const extractedItems: ItemFormData[] = extraction.items.map((item) => ({
        itemName: item.itemName,
        itemDescription: item.itemDescription || item.itemName,
        category: item.category,
        material: item.material || "",
        countryOfOrigin: item.countryOfOrigin,
        hsCode: item.hsCode || "",
        hsCodeSource: item.hsCodeSource || "",
        hsCodeConfidence: item.hsCodeConfidence || "",
        hsCodeCandidates: item.hsCodeCandidates || [],
        price: item.price,
        currency: item.currency || extraction.detectedCurrency || "SAR",
        quantity: item.quantity,
        showDetails: false,
        hsManualEntry: false,
      }));

      setFormData((prev) => ({
        ...prev,
        items: extractedItems.length > 0 ? extractedItems : [{ ...defaultItem }],
        tradeDocuments: [
          {
            fileName: uploadResponse.metadata.name,
            objectPath: uploadResponse.objectPath,
            contentType: normalizeTradeDocumentContentType(
              uploadResponse.metadata.contentType,
              uploadResponse.metadata.name,
            ),
            size: uploadResponse.metadata.size,
            documentType: "COMMERCIAL_INVOICE",
          },
        ],
      }));
      setInvoiceExtractionSummary(extraction.summary || null);

      toast({
        title: "Invoice processed",
        description: `${extractedItems.length} item${extractedItems.length === 1 ? "" : "s"} imported.`,
      });
    } catch (error) {
      setFormData((prev) => ({ ...prev, tradeDocuments: [] }));
      setInvoiceExtractionSummary(null);
      toast({
        title: "Could not process invoice",
        description: error instanceof Error ? error.message : "Please upload another invoice or enter the items manually.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingInvoice(false);
      e.target.value = "";
    }
  };

  const openAddItemSheet = () => {
    setEditingItemIndex(null);
    setEditingItem({ ...defaultItem });
    setItemSheetOpen(true);
  };

  const openEditItemSheet = (index: number) => {
    setEditingItemIndex(index);
    setEditingItem({ ...formData.items[index] });
    setItemSheetOpen(true);
  };

  const updateEditingItem = (field: string, value: any) => {
    setEditingItem(prev => ({ ...prev, [field]: value }));
  };

  const saveItemFromSheet = () => {
    if (!editingItem.itemName.trim()) {
      toast({ title: "Item name is required", variant: "destructive" });
      return;
    }
    if (!editingItem.category) {
      toast({ title: "Category is required", variant: "destructive" });
      return;
    }
    if (editingItem.price <= 0) {
      toast({ title: "Unit price must be greater than 0", variant: "destructive" });
      return;
    }
    if (editingItem.quantity < 1) {
      toast({ title: "Quantity must be at least 1", variant: "destructive" });
      return;
    }

    if (editingItemIndex !== null) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map((item, i) => i === editingItemIndex ? { ...editingItem } : item),
      }));
    } else {
      setFormData(prev => {
        const hasOnlyBlank = prev.items.length === 1 && !prev.items[0].itemName.trim();
        return {
          ...prev,
          items: hasOnlyBlank ? [{ ...editingItem }] : [...prev.items, { ...editingItem }],
        };
      });
    }
    setItemSheetOpen(false);
  };

  const lookupHsCodeForSheet = async () => {
    if (!editingItem.itemName || !editingItem.category || !editingItem.countryOfOrigin) {
      toast({ title: "Please fill in item name, category, and origin country first", variant: "destructive" });
      return;
    }

    const destinationCountry = formData.shipmentType === "inbound"
      ? formData.recipient.countryCode || "SA"
      : formData.recipient.countryCode || formData.shipper.countryCode || "SA";

    setHsLookupLoading(prev => ({ ...prev, sheet: true }));
    try {
      const params = new URLSearchParams({
        itemName: editingItem.itemName,
        category: editingItem.category,
        countryOfOrigin: editingItem.countryOfOrigin,
        destinationCountry,
      });
      if (editingItem.itemDescription) params.set("itemDescription", editingItem.itemDescription);
      if (editingItem.material) params.set("material", editingItem.material);

      const res = await fetch(`/api/hs-lookup?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Lookup failed");

      const data = await res.json() as { candidates: Array<{ code: string; description: string; confidence: number }>; source: string };
      const needsDetails = data.candidates.length > 1 || isGenericItemName(editingItem.itemName);
      const topCandidate = data.candidates[0];
      setEditingItem(prev => ({
        ...prev,
        hsCodeCandidates: data.candidates,
        hsCode: topCandidate ? topCandidate.code : "",
        hsCodeSource: data.source as HsCodeSourceValue,
        hsCodeConfidence: topCandidate ? confidenceFromNumber(topCandidate.confidence) : "MISSING",
        showDetails: needsDetails || prev.showDetails,
      }));
    } catch {
      toast({ title: "HS code lookup failed", variant: "destructive" });
    } finally {
      setHsLookupLoading(prev => ({ ...prev, sheet: false }));
    }
  };

  const confirmHsCodeForSheet = async (selectedCode?: string) => {
    const code = selectedCode || editingItem.hsCode;
    if (!code || !editingItem.itemName || !editingItem.category || !editingItem.countryOfOrigin) return;
    try {
      if (!quoteMode) await apiRequest("POST", "/api/client/hs-code/confirm", {
        itemName: editingItem.itemName,
        category: editingItem.category,
        material: editingItem.material || undefined,
        countryOfOrigin: editingItem.countryOfOrigin,
        hsCode: code,
        description: editingItem.hsCodeCandidates.find(c => c.code === code)?.description,
      });
    } catch {}
  };

  const lookupHsCode = async (index: number) => {
    const item = formData.items[index];
    if (!item.itemName || !item.category || !item.countryOfOrigin) {
      toast({ title: "Please fill in item name, category, and origin country first", variant: "destructive" });
      return;
    }

    const destinationCountry = formData.shipmentType === "inbound"
      ? formData.recipient.countryCode || "SA"
      : formData.recipient.countryCode || formData.shipper.countryCode || "SA";

    setHsLookupLoading(prev => ({ ...prev, [index]: true }));
    try {
      const params = new URLSearchParams({
        itemName: item.itemName,
        category: item.category,
        countryOfOrigin: item.countryOfOrigin,
        destinationCountry,
      });
      if (item.itemDescription) params.set("itemDescription", item.itemDescription);
      if (item.material) params.set("material", item.material);

      const res = await fetch(`/api/hs-lookup?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Lookup failed");

      const data = await res.json() as { candidates: Array<{ code: string; description: string; confidence: number }>; source: string };

      setFormData(prev => ({
        ...prev,
        items: prev.items.map((it, i) => {
          if (i !== index) return it;
          const needsDetails = data.candidates.length > 1 || isGenericItemName(it.itemName);
          const topCandidate = data.candidates[0];
          return {
            ...it,
            hsCodeCandidates: data.candidates,
            hsCode: topCandidate ? topCandidate.code : "",
            hsCodeSource: data.source as HsCodeSourceValue,
            hsCodeConfidence: topCandidate ? confidenceFromNumber(topCandidate.confidence) : "MISSING",
            showDetails: needsDetails || it.showDetails,
          };
        }),
      }));
    } catch {
      toast({ title: "HS code lookup failed", variant: "destructive" });
    } finally {
      setHsLookupLoading(prev => ({ ...prev, [index]: false }));
    }
  };

  const confirmHsCodeSelection = async (index: number) => {
    const item = formData.items[index];
    if (!item.hsCode || !item.itemName || !item.category || !item.countryOfOrigin) return;

    try {
      if (!quoteMode) await apiRequest("POST", "/api/client/hs-code/confirm", {
        itemName: item.itemName,
        category: item.category,
        material: item.material || undefined,
        countryOfOrigin: item.countryOfOrigin,
        hsCode: item.hsCode,
        description: item.hsCodeCandidates.find(c => c.code === item.hsCode)?.description,
      });
    } catch {}
  };

  const isPostalRequired = (countryCode: string) => isPostalCodeRequired(countryCode);

  const isStateRequired = (countryCode: string) => {
    return STATE_REQUIRED_COUNTRIES.has(countryCode.toUpperCase());
  };

  const updateDangerousGoods = <K extends keyof DangerousGoodsFormData>(
    field: K,
    value: DangerousGoodsFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, dangerousGoods: { ...prev.dangerousGoods, [field]: value } }));
  };

  const handleDangerousGoodsUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    documentType: typeof DangerousGoodsDocumentType[keyof typeof DangerousGoodsDocumentType],
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) {
      toast({
        title: "Document is too large",
        description: `The file exceeds the ${Math.round(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB limit.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const uploadResponse = await uploadDangerousGoodsFile(file);
    e.target.value = "";
    if (!uploadResponse) return;

    const contentType = uploadResponse.metadata.contentType || file.type || "application/octet-stream";

    setFormData((prev) => ({
      ...prev,
      dangerousGoodsDocuments: [
        ...prev.dangerousGoodsDocuments,
        {
          fileName: uploadResponse.metadata.name,
          objectPath: uploadResponse.objectPath,
          contentType,
          size: file.size,
          documentType,
          uploadedAt: new Date().toISOString(),
        },
      ],
    }));

    // Only the safety data sheet is machine-read. A Shipper's Declaration is the output of
    // this process, not an input to it — reading one back would just echo the client's own
    // paperwork into the form we are asking them to check.
    if (documentType !== DangerousGoodsDocumentType.SAFETY_DATA_SHEET) return;

    setIsExtractingDangerousGoods(true);
    try {
      const res = await apiRequest("POST", "/api/client/shipments/extract-dangerous-goods", {
        fileName: uploadResponse.metadata.name,
        objectPath: uploadResponse.objectPath,
        contentType,
      });
      const extraction = await res.json() as DangerousGoodsExtractionResponse;
      setDangerousGoodsExtraction(extraction);

      if (extraction.commodities.length > 0) {
        setFormData((prev) => ({
          ...prev,
          dangerousGoods: {
            ...prev.dangerousGoods,
            commodities: extraction.commodities.map((commodity) => ({
              unNumber: commodity.unNumber,
              properShippingName: commodity.properShippingName,
              technicalName: commodity.technicalName,
              hazardClass: commodity.hazardClass,
              packingGroup: commodity.packingGroup,
              packingInstruction: commodity.packingInstruction,
              // Never extracted — an SDS describes the substance, not the shipment.
              quantityAmount: "",
              quantityUnits: "KG",
              quantityType: DgQuantityType.NET,
              cargoAircraftOnly: commodity.cargoAircraftOnly,
              fromDocument: true,
              missingFields: commodity.missingFields,
            })),
          },
        }));
      }

      toast({
        title: extraction.commodities.length > 0 ? "Safety data sheet read" : "Nothing to import",
        description: extraction.commodities.length > 0
          ? "Our team will check it against the sheet and complete the declaration."
          : "We couldn't find a transport classification in it. Our team will classify it by hand.",
      });
      // Straight on. Whatever we read off the document goes to operations, who check it
      // against the sheet themselves — showing the client a classification to approve would
      // be asking them to rubber-stamp a reading they have no way to verify.
      //
      // One exception, and it is the client's call rather than ours: if the sheet says the
      // product is not regulated for transport, they are in the wrong flow entirely. Stop and
      // say so, because an express shipment is quoted instantly and costs less.
      if (extraction.notDangerousGoods) return;
      setStep(isInternationalShipment ? customsStep : dangerousGoodsSubmitStep);
    } catch (error) {
      // A failed read is not a failed upload: the document is attached and the client can
      // still type the declaration in. Blocking here would make the AI a hard dependency —
      // so we still advance, and the toast says what they have to do when they land.
      // Not fatal, and not the client's problem to fix: the document is attached, and an
      // operator reads it by hand. Blocking here would make the AI a hard dependency.
      toast({
        title: "We saved your document",
        description: "We couldn't read it automatically, so our team will classify it by hand.",
      });
      setStep(isInternationalShipment ? customsStep : dangerousGoodsSubmitStep);
    } finally {
      setIsExtractingDangerousGoods(false);
    }
  };

  const removeDangerousGoodsDocument = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      dangerousGoodsDocuments: prev.dangerousGoodsDocuments.filter((_, i) => i !== index),
    }));
  };

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!formData.shipmentType) {
        toast({ title: "Please select a shipment type", variant: "destructive" });
        return false;
      }
    } else if (currentStep === 2) {
      const { name, phone, countryCode, city, postalCode, addressLine1, shortAddress, stateOrProvince } = formData.shipper;
      if (!name || !phone || !countryCode || !city || !addressLine1) {
        toast({ title: "Please fill in all required sender fields", variant: "destructive" });
        return false;
      }
      if (formData.shipmentType === "domestic" && countryCode !== "SA") {
        toast({ title: "Domestic shipments must be within Saudi Arabia", variant: "destructive" });
        return false;
      }
      if (isPostalRequired(countryCode) && !postalCode) {
        toast({ title: "Sender postal code is required", description: `A valid postal code is required for ${countryCode}.`, variant: "destructive" });
        return false;
      }
      if (isPostalRequired(countryCode)) {
        const hint = postalFormatError(countryCode, postalCode);
        if (hint) {
          toast({ title: "Check the sender postal code", description: hint, variant: "destructive" });
          return false;
        }
      }
      if (countryCode === "SA" && !shortAddress) {
        toast({ title: "Sender National Address is required", description: "KSA addresses need a National Address short code (e.g. RCTB4359).", variant: "destructive" });
        return false;
      }
      if (countryCode === "SA" && shortAddress && !SA_SHORT_ADDRESS_REGEX.test(shortAddress.trim())) {
        toast({ title: "Check the sender National Address", description: "It should be 4 letters followed by 4 digits, e.g. RCTB4359.", variant: "destructive" });
        return false;
      }
      if (isStateRequired(countryCode) && !stateOrProvince) {
        toast({ title: "Sender state / province is required", description: "US and Canada addresses need a state or province.", variant: "destructive" });
        return false;
      }
    } else if (currentStep === 3) {
      const { name, phone, countryCode, city, postalCode, addressLine1, shortAddress, stateOrProvince } = formData.recipient;
      if (!name || !phone || !countryCode || !city || !addressLine1) {
        toast({ title: "Please fill in all required recipient fields", variant: "destructive" });
        return false;
      }
      if (formData.shipmentType === "domestic" && countryCode !== "SA") {
        toast({ title: "Domestic shipments must be within Saudi Arabia", variant: "destructive" });
        return false;
      }
      if (isPostalRequired(countryCode) && !postalCode) {
        toast({ title: "Recipient postal code is required", description: `A valid postal code is required for ${countryCode}.`, variant: "destructive" });
        return false;
      }
      if (isPostalRequired(countryCode)) {
        const hint = postalFormatError(countryCode, postalCode);
        if (hint) {
          toast({ title: "Check the recipient postal code", description: hint, variant: "destructive" });
          return false;
        }
      }
      if (countryCode === "SA" && !shortAddress) {
        toast({ title: "Recipient National Address is required", description: "KSA addresses need a National Address short code (e.g. RCTB4359).", variant: "destructive" });
        return false;
      }
      if (countryCode === "SA" && shortAddress && !SA_SHORT_ADDRESS_REGEX.test(shortAddress.trim())) {
        toast({ title: "Check the recipient National Address", description: "It should be 4 letters followed by 4 digits, e.g. RCTB4359.", variant: "destructive" });
        return false;
      }
      if (isStateRequired(countryCode) && !stateOrProvince) {
        toast({ title: "Recipient state / province is required", description: "US and Canada addresses need a state or province.", variant: "destructive" });
        return false;
      }
    } else if (currentStep === 4) {
      if (!formData.packageType || formData.packages.length < 1) {
        toast({ title: "Please fill in all package details", variant: "destructive" });
        return false;
      }
      for (let i = 0; i < formData.packages.length; i++) {
        const pkg = formData.packages[i];
        if (!pkg.weight || !pkg.length || !pkg.width || !pkg.height) {
          toast({ title: `Please fill in all details for Package ${i + 1}`, variant: "destructive" });
          return false;
        }
      }
    } else if (currentStep === dangerousGoodsContentStep && showDangerousGoodsStep) {
      if (!formData.dangerousGoods.contentKind) {
        toast({ title: "Choose what you're shipping", variant: "destructive" });
        return false;
      }
    } else if (currentStep === dangerousGoodsDocumentsStep && showDangerousGoodsStep) {
      if (formData.dangerousGoodsDocuments.length === 0) {
        toast({
          title: "Upload the safety data sheet",
          description: "We read the transport classification off it so you don't have to type it in.",
          variant: "destructive",
        });
        return false;
      }
    } else if (currentStep === customsStep && isInternationalShipment) {
      if (customsInputMode === "invoice" && !invoiceDocument) {
        toast({ title: "Please upload an invoice", variant: "destructive" });
        return false;
      }

      const validItems = formData.items.filter(item => item.itemName.trim() !== "");
      if (validItems.length === 0) {
        toast({ title: "Please add at least one item for customs", variant: "destructive" });
        return false;
      }
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        if (!item.category || !item.countryOfOrigin || item.price <= 0 || item.quantity < 1) {
          toast({ title: `Please fill in all required fields for "${item.itemName}"`, variant: "destructive" });
          return false;
        }
      }
    }
    return true;
  };

  const buildCheckoutPayload = () => {
    if (!selectedQuoteId) {
      return null;
    }

    const payload: {
      quoteId: string;
      items?: Array<{
        itemName: string;
        itemDescription?: string;
        category: string;
        material?: string;
        countryOfOrigin: string;
        hsCode?: string;
        hsCodeSource?: HsCodeSourceValue;
        hsCodeConfidence?: HsCodeConfidenceValue;
        hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
        price: number;
        currency?: string;
        quantity: number;
      }>;
      tradeDocuments?: ShipmentTradeDocument[];
      dangerousGoodsDocuments?: DangerousGoodsDocument[];
      pickup?: { requested: boolean; date?: string; readyTime?: string; closeTime?: string; location?: string; instructions?: string };
    } = {
      quoteId: selectedQuoteId,
    };

    // The declaration itself is already on the quote (it was needed to price the shipment);
    // only the paperwork is uploaded at checkout.
    if (formData.hasDangerousGoods && formData.dangerousGoodsDocuments.length > 0) {
      payload.dangerousGoodsDocuments = formData.dangerousGoodsDocuments;
    }

    // Express shipments are always booked for a carrier pickup. Send a custom date/window only
    // when the client explicitly chose one; otherwise the server applies the cutoff-based default.
    payload.pickup = {
      requested: true,
      ...(pickup.custom && pickup.date
        ? { date: pickup.date, readyTime: pickup.readyTime, closeTime: pickup.closeTime }
        : {}),
      location: pickup.location || undefined,
      instructions: pickup.instructions || undefined,
    };

    if (isInternationalShipment) {
      payload.items = formData.items
        .filter((item) => item.itemName.trim() !== "")
        .map((item) => ({
          itemName: item.itemName,
          itemDescription: item.itemDescription || undefined,
          category: item.category,
          material: item.material || undefined,
          countryOfOrigin: item.countryOfOrigin,
          hsCode: item.hsCode || undefined,
          hsCodeSource: item.hsCodeSource || undefined,
          hsCodeConfidence: item.hsCodeConfidence || undefined,
          hsCodeCandidates: item.hsCodeCandidates.length > 0 ? item.hsCodeCandidates : undefined,
          price: item.price,
          currency: item.currency,
          quantity: item.quantity,
        }));
      payload.tradeDocuments = customsInputMode === "invoice" ? formData.tradeDocuments : [];
    }

    return payload;
  };

  // Signature of the rate-affecting inputs. Reused so stepping back to the package step and
  // forward again does NOT re-fetch rates (which would mint new quote IDs and clear the
  // existing checkout, causing a duplicate shipment). Only a real change re-quotes.
  const ratesSignature = () =>
    JSON.stringify({
      shipper: formData.shipper,
      recipient: formData.recipient,
      packages: formData.packages,
      weightUnit: formData.weightUnit,
      dimensionUnit: formData.dimensionUnit,
      packageType: formData.packageType,
      currency: formData.currency,
      // Included so editing the declaration re-quotes: a different content kind is a
      // different surcharge, and reusing the old quote would undercharge the client.
      dangerousGoods: formData.hasDangerousGoods
        ? toDangerousGoodsPayload(formData.dangerousGoods)
        : null,
    });

  const submitCheckout = () => {
    // The one wall in guest mode. Everything up to here was real; this is where an account is
    // needed, so the shipment is saved and the visitor is sent to register. Nothing is posted —
    // /api/client/shipments/checkout would 401, and a guest must not create a shipment row.
    if (isGuest) {
      const selectedRate = rates?.quotes.find((quote) => quote.quoteId === selectedQuoteId);
      saveGuestDraft({
        kind: "express",
        formData,
        indicativeQuote: selectedRate
          ? {
              carrierName: selectedRate.carrierName,
              serviceName: selectedRate.serviceName,
              totalSar: selectedRate.finalPrice,
              currency: selectedRate.currency || "SAR",
            }
          : undefined,
      });
      setStep(paymentStep);
      return;
    }

    const payload = buildCheckoutPayload();
    if (!payload) return;
    if (checkoutMutation.isPending) return; // a checkout is already in flight — ignore repeats
    const signature = JSON.stringify(payload);
    if (signature === lastCheckoutSignatureRef.current && (checkoutData || quotationSent)) {
      setStep(quoteMode ? confirmationStep : paymentStep);
      return;
    }
    lastCheckoutSignatureRef.current = signature;
    checkoutMutation.mutate(payload);
  };

  const nextStep = () => {
    if (!validateStep(step)) {
      return;
    }

    // Packages → dangerous goods (when declared) before rates are ever requested.
    if (step === 4 && showDangerousGoodsStep) {
      setStep(dangerousGoodsContentStep);
      return;
    }

    if (step === dangerousGoodsContentStep && showDangerousGoodsStep) {
      setStep(dangerousGoodsDocumentsStep);
      return;
    }

    // Dangerous goods skips rates entirely: after the safety data sheet it goes straight to
    // customs (international) or the pickup preference, and ends at a submission.
    if (showDangerousGoodsStep && step === dangerousGoodsDocumentsStep) {
      setStep(isInternationalShipment ? customsStep : dangerousGoodsSubmitStep);
      return;
    }

    const isLastStepBeforeRates = !showDangerousGoodsStep && step === 4;
    if (isLastStepBeforeRates) {
      if (getRatesMutation.isPending) return;
      // Reuse existing quotes when the rate inputs are unchanged (back → forward), keeping the
      // quote IDs + any checkout stable so no duplicate shipment is created.
      if (rates && ratesSignature() === lastRatesSignatureRef.current) {
        setStep(rateStep);
        return;
      }
      lastRatesSignatureRef.current = ratesSignature();
      getRatesMutation.mutate(formData);
      return;
    }

    if (step === rateStep) {
      // Rate selected → customs (international) or straight to the pickup step (domestic).
      setStep(isInternationalShipment ? customsStep : pickupStep);
      return;
    }

    if (step === customsStep && isInternationalShipment) {
      setStep(showDangerousGoodsStep ? dangerousGoodsSubmitStep : pickupStep);
      return;
    }

    if (step === pickupStep) {
      submitCheckout();
      return;
    }

    setStep(step + 1);
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  // Built rather than listed, so the titles cannot drift out of step with the computed step
  // numbers above when the dangerous goods step appears or disappears.
  const stepTitles = [
    "Shipment Type",
    "Sender Details",
    "Recipient Details",
    "Package Details",
    ...(showDangerousGoodsStep ? ["Content Type", "Safety Data Sheet"] : ["Select Rate"]),
    ...(isInternationalShipment ? ["Customs Details"] : []),
    ...(showDangerousGoodsStep ? ["Submit"] : ["Pickup", "Payment"]),
    "Confirmation",
  ];

  const senderNeedsShortAddress = formData.shipper.countryCode === "SA";
  const recipientNeedsShortAddress = formData.recipient.countryCode === "SA";

  const returnToParam = new URLSearchParams(searchString).get("returnTo");
  const backHref = returnToParam && returnToParam.startsWith("/client/") ? returnToParam : "/client/shipments";
  const backLabel = backHref.includes("/quick-quote") ? "Back to Quick Quote" : "Back to Shipments";

  return (
    <QuoteShell quoteMode={quoteMode} profile={account?.profile}>
      <div className={`p-6 mx-auto ${step === rateStep ? "max-w-7xl" : "max-w-3xl"}`}>
        <Link href={backHref}>
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Button>
        </Link>

        {showDangerousGoodsStep && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Dangerous goods shipment</p>
              <p className="text-sm text-muted-foreground">
                There is no instant price for regulated goods — we arrange the movement with the
                carrier directly, then send you a quotation to accept or decline. You will not be
                charged anything for submitting this declaration.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center mb-8">
          {stepTitles.map((_, index) => {
            const s = index + 1;
            const isLast = s === stepTitles.length;
            return (
            <div key={s} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {!isLast && (
                <div className={`w-6 h-1 mx-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
            );
          })}
        </div>

        <p className="text-center text-muted-foreground mb-6">{stepTitles[step - 1]}</p>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Shipment Type
              </CardTitle>
              <CardDescription>Select the shipment direction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base font-medium">Shipment Direction *</Label>
                <RadioGroup 
                  value={formData.shipmentType} 
                  onValueChange={(v: "domestic" | "inbound" | "outbound") => {
                    const accountAddress = getAccountShippingAddress();
                    const emptyAddress = {
                      name: "",
                      phone: "",
                      email: "",
                      countryCode: "",
                      city: "",
                      postalCode: "",
                      addressLine1: "",
                      addressLine2: "",
                      stateOrProvince: "",
                      shortAddress: "",
                    };

                    setSelectedQuoteId(null);
                    setRates(null);
                    setCheckoutData(null);
                    setConfirmData(null);
                    
                    if (v === "domestic") {
                      const shipperAddress = accountAddress ? { ...accountAddress, countryCode: "SA" } : { ...emptyAddress, countryCode: "SA" };
                      const recipientAddress = accountAddress ? { ...accountAddress, countryCode: "SA" } : { ...emptyAddress, countryCode: "SA" };
                      setFormData(prev => ({
                        ...prev,
                        shipmentType: v,
                        isDdp: false,
                        carrier: "",
                        serviceType: "",
                        shipper: shipperAddress,
                        recipient: recipientAddress,
                      }));
                    } else if (v === "inbound") {
                      setFormData(prev => ({
                        ...prev,
                        shipmentType: v,
                        isDdp: false,
                        carrier: "",
                        serviceType: "",
                        shipper: { ...emptyAddress },
                        recipient: accountAddress ? { ...accountAddress } : { ...emptyAddress },
                      }));
                    } else if (v === "outbound") {
                      setFormData(prev => ({
                        ...prev,
                        shipmentType: v,
                        isDdp: false,
                        carrier: "",
                        serviceType: "",
                        shipper: accountAddress ? { ...accountAddress } : { ...emptyAddress },
                        recipient: { ...emptyAddress },
                      }));
                    }
                  }}
                  className="mt-3"
                >
                  {shipmentTypeOptions.map((option) => (
                    <div 
                      key={option.value} 
                      className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover-elevate ${
                        formData.shipmentType === option.value ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      onClick={() => {
                        const v = option.value as "domestic" | "inbound" | "outbound";
                        const accountAddress = getAccountShippingAddress();
                        const emptyAddress = {
                          name: "",
                          phone: "",
                          email: "",
                          countryCode: "",
                          city: "",
                          postalCode: "",
                          addressLine1: "",
                          addressLine2: "",
                          stateOrProvince: "",
                          shortAddress: "",
                        };
                        
                        if (v === "domestic") {
                          const shipperAddress = accountAddress ? { ...accountAddress, countryCode: "SA" } : { ...emptyAddress, countryCode: "SA" };
                          const recipientAddress = accountAddress ? { ...accountAddress, countryCode: "SA" } : { ...emptyAddress, countryCode: "SA" };
                          setFormData(prev => ({
                            ...prev,
                            shipmentType: v,
                            isDdp: false,
                            shipper: shipperAddress,
                            recipient: recipientAddress,
                          }));
                        } else if (v === "inbound") {
                          setFormData(prev => ({
                            ...prev,
                            shipmentType: v,
                            isDdp: false,
                            shipper: { ...emptyAddress },
                            recipient: accountAddress ? { ...accountAddress } : { ...emptyAddress },
                          }));
                        } else if (v === "outbound") {
                          setFormData(prev => ({
                            ...prev,
                            shipmentType: v,
                            isDdp: false,
                            shipper: accountAddress ? { ...accountAddress } : { ...emptyAddress },
                            recipient: { ...emptyAddress },
                          }));
                        }
                      }}
                    >
                      <RadioGroupItem value={option.value} id={`shipment-type-${option.value}`} className="mt-1" />
                      <div>
                        <Label htmlFor={`shipment-type-${option.value}`} className="text-base font-medium cursor-pointer">
                          {option.label}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={nextStep} data-testid="button-next">Next: Sender Details</Button>
            </CardFooter>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Sender Details
              </CardTitle>
              <CardDescription>Enter the pickup address and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Saved sender addresses</p>
                  <p className="text-xs text-muted-foreground">
                    Reuse your default shipping address or any sender details you used in previous shipments.
                  </p>
                </div>
                {shipperAddressOptions.length > 0 ? (
                  <SearchableSelect
                    value=""
                    onValueChange={(value) => applySavedAddress("shipper", value)}
                    options={shipperAddressOptions}
                    placeholder="Choose a saved sender"
                    searchPlaceholder="Search saved senders..."
                    emptyMessage="No saved senders found."
                    data-testid="select-saved-shipper"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Saved sender addresses will appear here after you use them in shipments.
                  </p>
                )}
              </div>
              {formData.shipmentType === "outbound" && account?.shippingAddressLine1 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300">
                  Pre-filled with your default shipping address. You can edit these details if needed.
                </div>
              )}
              {formData.shipmentType === "domestic" && account?.shippingAddressLine1 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300">
                  Pre-filled with your default shipping address. You can edit these details if needed.
                </div>
              )}
              <div>
                <Label>Country *</Label>
                <SearchableSelect
                  value={formData.shipper.countryCode}
                  onValueChange={(v) => updateShipper("countryCode", v)}
                  options={COUNTRY_CODE_SELECT_OPTIONS}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  disabled={formData.shipmentType === "domestic"}
                  data-testid="select-shipper-country"
                />
                {formData.shipmentType === "domestic" && (
                  <p className="text-xs text-muted-foreground mt-1">Domestic shipments are within Saudi Arabia only</p>
                )}
              </div>
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={formData.shipper.name}
                  onChange={(e) => updateShipper("name", e.target.value)}
                  placeholder="Sender's full name"
                  data-testid="input-shipper-name"
                />
              </div>
              {account?.accountType === "company" && (
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={formData.shipper.company || ""}
                    onChange={(e) => updateShipper("company", e.target.value)}
                    placeholder="Sender company"
                    data-testid="input-shipper-company"
                  />
                </div>
              )}
              <div>
                <Label>Address Line 1 *</Label>
                <Input
                  value={formData.shipper.addressLine1}
                  onChange={(e) => updateShipper("addressLine1", e.target.value)}
                  placeholder="Street address"
                  data-testid="input-shipper-address1"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input
                  value={formData.shipper.addressLine2 || ""}
                  onChange={(e) => updateShipper("addressLine2", e.target.value)}
                  placeholder="Apt, Suite, Unit, etc."
                  data-testid="input-shipper-address2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City *</Label>
                  <GeoSuggestInput
                    mode="city"
                    country={formData.shipper.countryCode}
                    value={formData.shipper.city}
                    onChange={(v) => updateShipper("city", v)}
                    onPick={(s) => pickShipperGeo(s)}
                    placeholder="City"
                    data-testid="input-shipper-city"
                  />
                </div>
                <div>
                  <Label>State/Province {isStateRequired(formData.shipper.countryCode) ? "*" : ""}</Label>
                  <Input
                    value={formData.shipper.stateOrProvince || ""}
                    onChange={(e) => updateShipper("stateOrProvince", e.target.value)}
                    placeholder="State"
                    data-testid="input-shipper-state"
                  />
                </div>
              </div>
              <div>
                <Label>Postal Code {isPostalRequired(formData.shipper.countryCode) ? "*" : ""}</Label>
                <GeoSuggestInput
                  mode="postal"
                  country={formData.shipper.countryCode}
                  value={formData.shipper.postalCode}
                  onChange={(v) => updateShipper("postalCode", v)}
                  onPick={(s) => pickShipperGeo(s)}
                  placeholder="Postal code"
                  data-testid="input-shipper-postal"
                />
                {POSTAL_FORMATS[formData.shipper.countryCode?.toUpperCase()] && (
                  <p className="mt-1 text-xs text-muted-foreground">{POSTAL_FORMATS[formData.shipper.countryCode.toUpperCase()].hint}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone *</Label>
                  <PhoneInput
                    value={formData.shipper.phone}
                    onChange={(v) => updateShipper("phone", v)}
                    defaultCountry={formData.shipper.countryCode || "SA"}
                    data-testid="input-shipper-phone"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.shipper.email || ""}
                    onChange={(e) => updateShipper("email", e.target.value)}
                    placeholder="sender@example.com"
                    data-testid="input-shipper-email"
                  />
                </div>
              </div>
              {senderNeedsShortAddress && (
                <div>
                  <Label>Short Address *</Label>
                  <Input
                    value={formData.shipper.shortAddress || ""}
                    onChange={(e) => updateShipper("shortAddress", e.target.value)}
                    placeholder="e.g. RCTB4359"
                    data-testid="input-shipper-short-address"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Required for KSA addresses</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={prevStep} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">Next: Recipient Details</Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Recipient Details
              </CardTitle>
              <CardDescription>Enter the delivery address and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Saved recipient addresses</p>
                  <p className="text-xs text-muted-foreground">
                    Reuse recipient details from your previous shipments instead of typing them again.
                  </p>
                </div>
                {recipientAddressOptions.length > 0 ? (
                  <SearchableSelect
                    value=""
                    onValueChange={(value) => applySavedAddress("recipient", value)}
                    options={recipientAddressOptions}
                    placeholder="Choose a saved recipient"
                    searchPlaceholder="Search saved recipients..."
                    emptyMessage="No saved recipients found."
                    data-testid="select-saved-recipient"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Saved recipient addresses will appear here after you use them in shipments.
                  </p>
                )}
              </div>
              {formData.shipmentType === "inbound" && account?.shippingAddressLine1 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300">
                  Pre-filled with your default shipping address. You can edit these details if needed.
                </div>
              )}
              {formData.shipmentType === "domestic" && account?.shippingAddressLine1 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300">
                  Pre-filled with your default shipping address. You can edit these details if needed.
                </div>
              )}
              <div>
                <Label>Country *</Label>
                <SearchableSelect
                  value={formData.recipient.countryCode}
                  onValueChange={(v) => updateRecipient("countryCode", v)}
                  options={COUNTRY_CODE_SELECT_OPTIONS}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  disabled={formData.shipmentType === "domestic"}
                  data-testid="select-recipient-country"
                />
                {formData.shipmentType === "domestic" && (
                  <p className="text-xs text-muted-foreground mt-1">Domestic shipments are within Saudi Arabia only</p>
                )}
              </div>
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={formData.recipient.name}
                  onChange={(e) => updateRecipient("name", e.target.value)}
                  placeholder="Recipient's full name"
                  data-testid="input-recipient-name"
                />
              </div>
              {account?.accountType === "company" && (
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={formData.recipient.company || ""}
                    onChange={(e) => updateRecipient("company", e.target.value)}
                    placeholder="Recipient company (optional)"
                    data-testid="input-recipient-company"
                  />
                </div>
              )}
              <div>
                <Label>Address Line 1 *</Label>
                <Input
                  value={formData.recipient.addressLine1}
                  onChange={(e) => updateRecipient("addressLine1", e.target.value)}
                  placeholder="Street address"
                  data-testid="input-recipient-address1"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input
                  value={formData.recipient.addressLine2 || ""}
                  onChange={(e) => updateRecipient("addressLine2", e.target.value)}
                  placeholder="Apt, Suite, Unit, etc."
                  data-testid="input-recipient-address2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City *</Label>
                  <GeoSuggestInput
                    mode="city"
                    country={formData.recipient.countryCode}
                    value={formData.recipient.city}
                    onChange={(v) => updateRecipient("city", v)}
                    onPick={(s) => pickRecipientGeo(s)}
                    placeholder="City"
                    data-testid="input-recipient-city"
                  />
                </div>
                <div>
                  <Label>State/Province {isStateRequired(formData.recipient.countryCode) ? "*" : ""}</Label>
                  <Input
                    value={formData.recipient.stateOrProvince || ""}
                    onChange={(e) => updateRecipient("stateOrProvince", e.target.value)}
                    placeholder="State"
                    data-testid="input-recipient-state"
                  />
                </div>
              </div>
              <div>
                <Label>Postal Code {isPostalRequired(formData.recipient.countryCode) ? "*" : ""}</Label>
                <GeoSuggestInput
                  mode="postal"
                  country={formData.recipient.countryCode}
                  value={formData.recipient.postalCode}
                  onChange={(v) => updateRecipient("postalCode", v)}
                  onPick={(s) => pickRecipientGeo(s)}
                  placeholder="Postal code"
                  data-testid="input-recipient-postal"
                />
                {POSTAL_FORMATS[formData.recipient.countryCode?.toUpperCase()] && (
                  <p className="mt-1 text-xs text-muted-foreground">{POSTAL_FORMATS[formData.recipient.countryCode.toUpperCase()].hint}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone *</Label>
                  <PhoneInput
                    value={formData.recipient.phone}
                    onChange={(v) => updateRecipient("phone", v)}
                    defaultCountry={formData.recipient.countryCode || "SA"}
                    data-testid="input-recipient-phone"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.recipient.email || ""}
                    onChange={(e) => updateRecipient("email", e.target.value)}
                    placeholder="recipient@example.com"
                    data-testid="input-recipient-email"
                  />
                </div>
              </div>
              {recipientNeedsShortAddress && (
                <div>
                  <Label>Short Address *</Label>
                  <Input
                    value={formData.recipient.shortAddress || ""}
                    onChange={(e) => updateRecipient("shortAddress", e.target.value)}
                    placeholder="e.g. RCTB4359"
                    data-testid="input-recipient-short-address"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Required for KSA addresses</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={prevStep} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">Next: Package Details</Button>
            </CardFooter>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Package Details
              </CardTitle>
              <CardDescription>
                Describe {formData.packages.length === 1 ? "your package" : `your ${formData.packages.length} packages`} to get accurate rates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Packing List
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload a packing list or spreadsheet and we will prepare the cartons, total weight, and package count for you.
                    </p>
                  </div>
                  <label htmlFor="packing-list-upload" className="cursor-pointer">
                    <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span>
                        {isUploadingPackageList || isExtractingPackageList
                          ? "Processing..."
                          : packageListDocument
                            ? "Replace Packing List"
                            : "Upload Packing List"}
                      </span>
                    </div>
                    <input
                      id="packing-list-upload"
                      type="file"
                      accept={PACKAGE_LIST_ACCEPT}
                      className="hidden"
                      onChange={handlePackageListSelect}
                      disabled={isUploadingPackageList || isExtractingPackageList}
                      data-testid="input-packing-list-upload"
                    />
                  </label>
                </div>

                {packageListDocument ? (
                  <div
                    className="rounded-lg border p-3"
                    data-testid={`packing-list-document-${packageListDocument.objectPath}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{packageListDocument.fileName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {packageListDocument.contentType} · {formatFileSize(packageListDocument.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={clearPackageListDocument}
                        data-testid={`button-remove-packing-list-${packageListDocument.fileName}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No packing list uploaded.</p>
                  </div>
                )}

                {(isUploadingPackageList || isExtractingPackageList) && (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                    <LoadingSpinner size="sm" />
                    <span>Processing packing list...</span>
                  </div>
                )}

                {packageExtractionSummary && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium">
                          {packageExtractionSummary.importedPackageCount} carton{packageExtractionSummary.importedPackageCount === 1 ? "" : "s"} imported.
                        </p>
                        <p>Total gross weight: {packageExtractionSummary.totalWeight.toFixed(3)} {formData.weightUnit}.</p>
                        <p>Please review the imported packages before getting rates.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Package Type</Label>
                  <Select
                    value={formData.packageType}
                    onValueChange={(v) => updateSharedPackageSetting("packageType", v)}
                  >
                    <SelectTrigger data-testid="select-package-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {packageTypes.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Weight Unit</Label>
                  <Select
                    value={formData.weightUnit}
                    onValueChange={(v) => updateSharedPackageSetting("weightUnit", v)}
                  >
                    <SelectTrigger data-testid="select-weight-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LB">Pounds (LB)</SelectItem>
                      <SelectItem value="KG">Kilograms (KG)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dimension Unit</Label>
                  <Select
                    value={formData.dimensionUnit}
                    onValueChange={(v) => updateSharedPackageSetting("dimensionUnit", v)}
                  >
                    <SelectTrigger data-testid="select-dimension-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">Inches (IN)</SelectItem>
                      <SelectItem value="CM">Centimeters (CM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Packages</p>
                  <p className="mt-2 text-2xl font-semibold">{formData.packages.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Billing Basis</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {getChargeableWeightBasisLabel(actualPackageCount, dimensionalPackageCount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatChargeablePackageCounts(actualPackageCount, dimensionalPackageCount)}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Billable Weight</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {chargeableWeightSummary.chargeableWeight.toFixed(3)}{" "}
                    <span className="text-sm font-medium text-muted-foreground">{chargeableWeightSummary.weightUnit}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{getChargeableWeightExplanation(chargeableWeightSummary)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Package Type</p>
                  <p className="mt-2 text-lg font-semibold">{packageTypeLabels[formData.packageType] || "Your Own Packaging"}</p>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                Carriers bill the greater of actual weight and dimensional weight per package. We calculate it here for visibility, while each carrier still receives the actual package weight and dimensions for live rating.
              </div>

              <div className="space-y-4">
                {formData.packages.map((pkg, index) => {
                  const chargeablePackage = chargeableWeightSummary.packages[index];

                  return (
                  <Card key={index} className="relative">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4">
                      <CardTitle className="text-sm font-medium">
                        {pkg.reference ? `Carton ${pkg.reference}` : `Package ${index + 1}`}
                      </CardTitle>
                      {formData.packages.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePackage(index)}
                          data-testid={`button-remove-package-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 space-y-3">
                      <div>
                        <Label>Weight ({formData.weightUnit}) *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={pkg.weight}
                          onChange={(e) => updatePackageItem(index, "weight", parseFloat(e.target.value) || 0)}
                          data-testid={`input-weight-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label>Length ({formData.dimensionUnit}) *</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pkg.length}
                            onChange={(e) => updatePackageItem(index, "length", parseFloat(e.target.value) || 0)}
                            data-testid={`input-length-${index}`}
                          />
                        </div>
                        <div>
                          <Label>Width ({formData.dimensionUnit}) *</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pkg.width}
                            onChange={(e) => updatePackageItem(index, "width", parseFloat(e.target.value) || 0)}
                            data-testid={`input-width-${index}`}
                          />
                        </div>
                        <div>
                          <Label>Height ({formData.dimensionUnit}) *</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pkg.height}
                            onChange={(e) => updatePackageItem(index, "height", parseFloat(e.target.value) || 0)}
                            data-testid={`input-height-${index}`}
                          />
                        </div>
                      </div>
                      {chargeablePackage && (
                        <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground md:grid-cols-2">
                          <div>
                            <span className="block font-medium text-foreground">Billable</span>
                            {formatWeight(chargeablePackage.chargeableWeight, chargeablePackage.weightUnit)}
                          </div>
                          <div>
                            <span className="block font-medium text-foreground">Basis</span>
                            {chargeablePackage.usesDimensionalWeight ? "Dimensional weight" : "Actual weight"}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
                <Button
                  variant="outline"
                  onClick={addPackage}
                  className="w-full"
                  data-testid="button-add-package"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Package
                </Button>
              </div>

            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={prevStep} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} disabled={getRatesMutation.isPending} data-testid="button-get-rates">
                {getRatesMutation.isPending ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Getting Rates...</>
                ) : showDangerousGoodsStep ? (
                  "Next: Dangerous Goods"
                ) : (
                  "Get Shipping Rates"
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === dangerousGoodsContentStep && showDangerousGoodsStep && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                What are you shipping?
              </CardTitle>
              <CardDescription>
                Pick the closest match. This decides how the shipment is declared to the carrier,
                so choose by what is actually in the box rather than what it is used for.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DANGEROUS_GOODS_CONTENT_KINDS.map((kind) => {
                  const Icon = kind.icon;
                  const selected = formData.dangerousGoods.contentKind === kind.value;
                  return (
                    <button
                      key={kind.value}
                      type="button"
                      onClick={() => updateDangerousGoods("contentKind", kind.value)}
                      className={`flex gap-3 rounded-lg border p-4 text-left transition-colors hover-elevate ${
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                      }`}
                      data-testid={`card-dg-kind-${kind.value}`}
                    >
                      <div
                        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${
                          selected ? "bg-primary/15" : "bg-muted"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{kind.label}</span>
                          {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{kind.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                Not sure which applies? Section 14 of your safety data sheet names the substance
                as it must be declared for transport.
              </p>
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(4)} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">Next: Safety Data Sheet</Button>
            </CardFooter>
          </Card>
        )}

        {step === dangerousGoodsDocumentsStep && showDangerousGoodsStep && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Safety data sheet
              </CardTitle>
              <CardDescription>
                Upload the SDS for what you're shipping. Our operations team classifies it
                against the sheet and completes the IATA declaration for you — you do not need
                to fill in UN numbers, packing groups or an emergency contact.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <Label
                  htmlFor="dg-sds-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium"
                >
                  {isUploadingDangerousGoodsDoc || isExtractingDangerousGoods
                    ? "Reading document..."
                    : "Upload safety data sheet"}
                </Label>
                <input
                  id="dg-sds-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,image/*"
                  disabled={isUploadingDangerousGoodsDoc || isExtractingDangerousGoods}
                  onChange={(e) => handleDangerousGoodsUpload(e, DangerousGoodsDocumentType.SAFETY_DATA_SHEET)}
                  data-testid="input-dg-sds-file"
                />
                <p className="text-xs text-muted-foreground mt-3">
                  PDF, Word, plain text or a photo of the document.
                </p>
              </div>

              {isExtractingDangerousGoods && (
                <div className="flex items-center gap-2 rounded-lg border p-4">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm">Reading section 14 of the safety data sheet...</span>
                </div>
              )}

              {dangerousGoodsExtraction?.notDangerousGoods && !isExtractingDangerousGoods && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-sm">
                    <p className="font-medium">This may not need the dangerous goods flow</p>
                    <p className="mt-1 text-muted-foreground">
                      That document says the product is <strong>not regulated</strong> for
                      transport. If that's right, send it as a normal express shipment instead —
                      you'll get a price immediately and it will cost less. If you're not sure,
                      carry on and our team will confirm it.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => navigate("/client/create-shipment")}
                      data-testid="button-switch-to-express"
                    >
                      Switch to an express shipment
                    </Button>
                  </div>
                </div>
              )}

              {formData.dangerousGoodsDocuments.length > 0 && (
                <div className="space-y-2">
                  <Label>Attached documents</Label>
                  {formData.dangerousGoodsDocuments.map((document, index) => (
                    <div key={index} className="flex items-center justify-between rounded border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="text-sm truncate">{document.fileName}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {document.documentType === DangerousGoodsDocumentType.SHIPPERS_DECLARATION
                            ? "Declaration"
                            : document.documentType === DangerousGoodsDocumentType.SAFETY_DATA_SHEET
                              ? "SDS"
                              : "Other"}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDangerousGoodsDocument(index)}
                        data-testid={`button-remove-dg-doc-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border p-4">
                <Label
                  htmlFor="dg-declaration-upload"
                  className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium"
                >
                  <Upload className="h-4 w-4" />
                  Add the Shipper&apos;s Declaration too (optional)
                </Label>
                <input
                  id="dg-declaration-upload"
                  type="file"
                  className="hidden"
                  disabled={isUploadingDangerousGoodsDoc || isExtractingDangerousGoods}
                  onChange={(e) => handleDangerousGoodsUpload(e, DangerousGoodsDocumentType.SHIPPERS_DECLARATION)}
                  data-testid="input-dg-declaration-file"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If you already have one prepared. We don't read it — it goes to our operations
                  team with the shipment.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(dangerousGoodsContentStep)} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">Continue</Button>
            </CardFooter>
          </Card>
        )}

        {step === rateStep && rates && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Select Shipping Rate
              </CardTitle>
              <CardDescription>
                {/* Guest quotes are not stored, so nothing expires — only a real quote has a
                    reservation to run out. */}
                {isGuest
                  ? "Choose your preferred shipping option. This is an indicative price at our standard individual rate."
                  : `Choose your preferred shipping option. Rates expire at ${format(new Date(rates.expiresAt), "h:mm a")}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {indicativeQuote && (
                <div
                  className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4"
                  data-testid="indicative-price-notice"
                >
                  <p className="text-sm font-medium">This is your account's price</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Before you registered we showed an indicative{" "}
                    <span className="font-medium tabular-nums">
                      {indicativeQuote.currency} {indicativeQuote.totalSar.toFixed(2)}
                    </span>{" "}
                    for {indicativeQuote.carrierName} {indicativeQuote.serviceName}. The rates below
                    are priced against your account — pick the one you want.
                  </p>
                </div>
              )}
              <RadioGroup
                value={selectedQuoteId || ""}
                onValueChange={setSelectedQuoteId}
                className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
              >
                {displayedCarriers.map((carrier) => {
                  const carrierQuotes = rates.quotes.filter((quote) => quote.carrierCode === carrier.code);

                  return (
                    <div key={carrier.code} className="rounded-2xl border bg-card/60 p-4 md:p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3 border-b pb-4">
                        <CarrierMark carrierCode={carrier.code} />
                        <Badge variant="secondary" className="shrink-0">
                          {carrierQuotes.length} option{carrierQuotes.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      {carrierQuotes[0]?.chargeableWeight && (
                        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Chargeable weight:</span>{" "}
                          {formatWeight(carrierQuotes[0].chargeableWeight, carrierQuotes[0].chargeableWeightUnit)}
                        </div>
                      )}

                      {carrierQuotes.length > 0 ? (
                        <div className="space-y-3">
                          {carrierQuotes.map((quote) => {
                            const serviceMeta = formatRateServiceMeta(quote.serviceType, quote.serviceName);

                            return (
                              <label
                                key={quote.quoteId}
                                htmlFor={quote.quoteId}
                                className={`block cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/40 hover:bg-muted/30 ${
                                  selectedQuoteId === quote.quoteId
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border"
                                }`}
                                data-testid={`rate-option-${carrier.code.toLowerCase()}-${quote.serviceType}`}
                              >
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value={quote.quoteId} id={quote.quoteId} className="mt-1 shrink-0" />
                                  <div className="min-w-0 flex-1 space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="min-w-0 space-y-1">
                                        <p className="text-base font-semibold leading-snug text-foreground break-words">
                                          {quote.serviceName}
                                        </p>
                                        {serviceMeta && (
                                          <p className="text-xs text-muted-foreground">
                                            {serviceMeta}
                                          </p>
                                        )}
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <p className="text-xl font-bold leading-none whitespace-nowrap">
                                          <SarAmount amount={quote.finalPrice} />
                                        </p>
                                        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                          {quote.currency}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                      <span className="flex items-center gap-1 whitespace-nowrap">
                                        <Clock className="h-4 w-4" />
                                        {quote.transitDays} day{quote.transitDays !== 1 ? "s" : ""}
                                      </span>
                                      {quote.estimatedDelivery && (
                                        <span className="whitespace-nowrap">
                                          Est. delivery: {format(new Date(quote.estimatedDelivery), "MMM d")}
                                        </span>
                                      )}
                                      {quote.chargeableWeight && (
                                        <span className="whitespace-nowrap">
                                          Billable weight: {formatWeight(quote.chargeableWeight, quote.chargeableWeightUnit)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                          No rates available for {carrier.name} on this shipment.
                        </div>
                      )}
                    </div>
                  );
                })}
              </RadioGroup>

              {quoteMode && selectedQuote && (() => {
                const total = Number(selectedQuote.finalPrice || 0);
                const discountAmount = quoteDiscountValue > 0
                  ? (quoteDiscountType === "percent"
                      ? Math.round((total * Math.min(quoteDiscountValue, 100) / 100) * 100) / 100
                      : Math.min(quoteDiscountValue, total))
                  : 0;
                return (
                  <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <Percent className="h-4 w-4 text-primary" /> Apply discount (optional)
                    </div>
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                      <Select value={quoteDiscountType} onValueChange={(v) => setQuoteDiscountType(v as "percent" | "fixed")}>
                        <SelectTrigger data-testid="select-quote-discount-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed (SAR)</SelectItem>
                          <SelectItem value="percent">Percent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder={quoteDiscountType === "percent" ? "e.g. 10" : "e.g. 50.00"}
                        value={quoteDiscountValue || ""}
                        onChange={(e) => setQuoteDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                        data-testid="input-quote-discount-value"
                      />
                    </div>
                    {discountAmount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Discount: <span className="font-medium text-foreground">− {discountAmount.toFixed(2)} SAR</span>
                        {" · "}Client total: <span className="font-medium text-foreground">{(total - discountAmount).toFixed(2)} SAR</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(showDangerousGoodsStep ? dangerousGoodsDocumentsStep : 4)}
                data-testid="button-prev"
              >
                Back
              </Button>
              <Button
                onClick={nextStep}
                disabled={!selectedQuoteId}
                data-testid="button-continue-from-rates"
              >
                {isInternationalShipment ? "Continue to Customs Details" : "Continue to Pickup"}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === customsStep && isInternationalShipment && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Customs Details
              </CardTitle>
              <CardDescription>
                Add the invoice or the shipment items for the selected service.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Selected Service</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedQuote?.carrierName} · {selectedQuote?.serviceName}
                    </p>
                  </div>
                  {selectedCarrierCode ? <CarrierMark carrierCode={selectedCarrierCode} /> : null}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-medium">How would you like to provide the invoice details?</Label>
                <RadioGroup
                  value={customsInputMode}
                  onValueChange={(value) => setCustomsInputMode(value as "invoice" | "manual")}
                  className="grid gap-3 md:grid-cols-2"
                  data-testid="customs-input-mode"
                >
                  <Label
                    htmlFor="customs-mode-invoice"
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                      customsInputMode === "invoice"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value="invoice" id="customs-mode-invoice" className="mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-sm font-medium">I have an invoice</span>
                      <p className="text-xs text-muted-foreground">Upload the invoice and import the shipment items.</p>
                    </div>
                  </Label>
                  <Label
                    htmlFor="customs-mode-manual"
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                      customsInputMode === "manual"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value="manual" id="customs-mode-manual" className="mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-sm font-medium">I do not have an invoice</span>
                      <p className="text-xs text-muted-foreground">Enter the shipment items manually.</p>
                    </div>
                  </Label>
                </RadioGroup>
              </div>

              {customsInputMode === "invoice" && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Invoice
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Upload a PDF, DOCX, XLS, XLSX, TXT, JPG, JPEG, PNG, or GIF invoice.
                      </p>
                    </div>
                    <label htmlFor="invoice-upload" className="cursor-pointer">
                      <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                        <Upload className="h-4 w-4" />
                        <span>{isUploadingInvoice || isExtractingInvoice ? "Processing..." : invoiceDocument ? "Replace Invoice" : "Upload Invoice"}</span>
                      </div>
                      <input
                        id="invoice-upload"
                        type="file"
                        accept={INVOICE_ACCEPT}
                        className="hidden"
                        onChange={handleInvoiceSelect}
                        disabled={isUploadingInvoice || isExtractingInvoice}
                        data-testid="input-invoice-upload"
                      />
                    </label>
                  </div>

                  {invoiceDocument ? (
                    <div
                      className="rounded-lg border p-3"
                      data-testid={`invoice-document-${invoiceDocument.objectPath}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">{invoiceDocument.fileName}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {invoiceDocument.contentType} · {formatFileSize(invoiceDocument.size)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={clearInvoiceDocument}
                          data-testid={`button-remove-invoice-${invoiceDocument.fileName}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                      <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No invoice uploaded.</p>
                    </div>
                  )}

                  {(isUploadingInvoice || isExtractingInvoice) && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                      <LoadingSpinner size="sm" />
                      <span>Processing invoice...</span>
                    </div>
                  )}

                  {invoiceExtractionSummary && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-medium">
                            {invoiceExtractionSummary.importedItemCount} item{invoiceExtractionSummary.importedItemCount === 1 ? "" : "s"} imported from your invoice.
                          </p>
                          <p>Please review the imported items before continuing.</p>
                          {invoiceExtractionSummary.autoMatchedHsCodeCount > 0 && (
                            <p>
                              HS codes were matched automatically for {invoiceExtractionSummary.autoMatchedHsCodeCount} item{invoiceExtractionSummary.autoMatchedHsCodeCount === 1 ? "" : "s"}.
                            </p>
                          )}
                          {invoiceExtractionSummary.hsCodeReviewCount > 0 && (
                            <p>
                              {invoiceExtractionSummary.hsCodeReviewCount} item{invoiceExtractionSummary.hsCodeReviewCount === 1 ? "" : "s"} need HS code review before you continue.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      {customsInputMode === "invoice" ? "Invoice Items" : "Shipment Items"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {customsInputMode === "invoice"
                        ? "Review the extracted items before continuing."
                        : "Add the shipment items manually."}
                    </p>
                  </div>
                  {(customsInputMode === "manual" || invoiceDocument) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openAddItemSheet}
                      data-testid="button-add-item"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  )}
                </div>

                {formData.items.length > 0 && formData.items[0].itemName ? (
                  <div className="space-y-2">
                    {formData.items.map((item, index) => {
                      const confidence = getConfidenceBadge(item.hsCodeConfidence);
                      const needsHsReview =
                        ((!item.hsCode && item.hsCodeCandidates.length > 0) ||
                          item.hsCodeConfidence === "LOW" ||
                          item.hsCodeConfidence === "MEDIUM") &&
                        item.category !== "";
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`item-row-${index}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{item.itemName}</span>
                              {item.hsCode && (
                                <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-hs-${index}`}>
                                  HS: {item.hsCode}
                                </Badge>
                              )}
                              {item.hsCode && (
                                <Badge className={`text-xs shrink-0 ${confidence.className}`} data-testid={`badge-hs-confidence-${index}`}>
                                  {confidence.label}
                                </Badge>
                              )}
                              {needsHsReview && (
                                <Badge variant="outline" className="text-xs shrink-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                                  HS review needed
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Qty: {item.quantity} × {Number(item.price.toFixed(7))} {item.currency}
                              {item.category && (
                                <span className="ml-2">
                                  · {itemCategories.find(c => c.value === item.category)?.label || item.category}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditItemSheet(index)}
                              data-testid={`button-edit-item-${index}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {formData.items.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeItem(index)}
                                data-testid={`button-remove-item-${index}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 border rounded-lg border-dashed">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {customsInputMode === "invoice" ? "No invoice items available yet." : "No items added yet."}
                    </p>
                    {customsInputMode === "manual" && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={openAddItemSheet}
                        className="mt-1"
                        data-testid="button-add-first-item"
                      >
                        Add your first item
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <DeclaredValueSummary items={formData.items} />
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(lastStepBeforeRoute)} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">
                Continue to Pickup
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === pickupStep && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" /> Carrier Pickup
              </CardTitle>
              <CardDescription>
                Your shipment is booked for a courier pickup automatically. You'll get the pickup confirmation number once payment is complete.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const def = computeDefaultPickup();
                return (
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                    <p className="font-medium">
                      {def.sameDay ? "Same-day pickup" : "Next business day pickup"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Default pickup date: <span className="font-medium text-foreground">{def.date}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Orders placed before {String(PICKUP_CUTOFF_HOUR).padStart(2, "0")}:00 (KSA) are picked up the same day; later orders roll to the next business day (Fri/Sat weekend excluded).
                    </p>
                  </div>
                );
              })()}

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pickup.custom}
                  onChange={(e) => setPickup({ ...pickup, custom: e.target.checked, date: pickup.date || computeDefaultPickup().date })}
                  data-testid="checkbox-custom-pickup"
                />
                I want to choose a custom pickup date
              </label>

              {pickup.custom && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Pickup date</Label>
                    <Input type="date" min={new Date().toISOString().slice(0, 10)} value={pickup.date} onChange={(e) => setPickup({ ...pickup, date: e.target.value })} data-testid="input-pickup-date" />
                  </div>
                  <div className="space-y-1"><Label>Location (optional)</Label><Input placeholder="Reception / dock" value={pickup.location} onChange={(e) => setPickup({ ...pickup, location: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Ready time</Label><Input type="time" value={pickup.readyTime} onChange={(e) => setPickup({ ...pickup, readyTime: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Close time</Label><Input type="time" value={pickup.closeTime} onChange={(e) => setPickup({ ...pickup, closeTime: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Instructions (optional)</Label><Input placeholder="e.g. call on arrival" value={pickup.instructions} onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })} /></div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(isInternationalShipment ? customsStep : lastStepBeforeRoute)} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} disabled={checkoutMutation.isPending} data-testid="button-checkout">
                {checkoutMutation.isPending ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Processing...</>
                ) : quoteMode ? (
                  <>Send Quotation</>
                ) : (
                  <>Proceed to Payment</>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === dangerousGoodsSubmitStep && showDangerousGoodsStep && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Submit for review
              </CardTitle>
              <CardDescription>
                Dangerous goods are not priced automatically. We arrange carriage with the
                carrier directly, then send you a quotation to accept or decline — nothing is
                charged until you do.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-medium text-right">
                    {formData.shipper.city}, {formData.shipper.countryCode} → {formData.recipient.city}, {formData.recipient.countryCode}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Packages</span>
                  <span className="font-medium text-right">
                    {formData.packages.length} · {formData.packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0)} {formData.weightUnit}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Declared</span>
                  <span className="font-medium text-right">
                    {formData.dangerousGoods.commodities
                      .map((commodity) => `${commodity.unNumber} ${commodity.properShippingName}`)
                      .filter((entry) => entry.trim())
                      .join(", ") || "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Documents</span>
                  <span className="font-medium text-right">
                    {formData.dangerousGoodsDocuments.length || "none"}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <p className="font-medium">What happens next</p>
                  <p className="mt-1 text-muted-foreground">
                    Our team checks the declaration against your safety data sheet and arranges
                    the movement with the carrier. You'll get a quotation by email — usually
                    within one business day — with the full price, the collection date the
                    carrier has agreed, and how long the price holds.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(isInternationalShipment ? customsStep : dangerousGoodsDocumentsStep)} data-testid="button-prev">Back</Button>
              <Button
                onClick={() => dangerousGoodsSubmitMutation.mutate()}
                disabled={dangerousGoodsSubmitMutation.isPending}
                data-testid="button-submit-dangerous-goods"
              >
                {dangerousGoodsSubmitMutation.isPending ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Submitting...</>
                ) : (
                  <>Submit declaration</>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === confirmationStep && showDangerousGoodsStep && dangerousGoodsSubmission && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Declaration submitted</CardTitle>
              <CardDescription>We'll come back to you with a price</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Reference</span>
                  <span className="font-mono">{dangerousGoodsSubmission.trackingNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Status</span>
                  <span>Awaiting review</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Charged so far</span>
                  <span className="font-medium">Nothing</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Our team is reviewing the declaration and arranging carriage with the carrier.
                You'll be emailed a quotation to accept or decline — the shipment does not move,
                and you are not charged, until you accept it.
              </p>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => navigate("/client/shipments")} data-testid="button-done">
                View All Shipments
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === paymentStep && isGuest && (
          <GuestCheckoutGate
            quote={(() => {
              const selected = rates?.quotes.find((quote) => quote.quoteId === selectedQuoteId);
              return selected
                ? {
                    carrierName: selected.carrierName,
                    serviceName: selected.serviceName,
                    totalSar: selected.finalPrice,
                    currency: selected.currency || "SAR",
                  }
                : null;
            })()}
          />
        )}

        {step === paymentStep && !isGuest && checkoutData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Options
              </CardTitle>
              <CardDescription>
                Choose how you'd like to pay for this shipment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Order Summary</h4>
                <div className="flex justify-between text-sm">
                  <span>Shipment ID</span>
                  <span className="font-mono">{checkoutData.trackingNumber}</span>
                </div>
                {(checkoutData.carrierName || checkoutData.serviceName) && (
                  <div className="flex justify-between gap-4 text-sm mt-2">
                    <span>Selected Service</span>
                    <span className="text-right font-medium">
                      {[checkoutData.carrierName, checkoutData.serviceName].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
                <div className="mt-4 rounded-lg border bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h5 className="text-sm font-semibold">Billable Weight Pricing</h5>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatChargeablePackageCounts(checkoutActualPackageCount, checkoutDimensionalPackageCount)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      Billable
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Billing Basis</p>
                      <p className="mt-1 font-semibold">
                        {getChargeableWeightBasisLabel(checkoutActualPackageCount, checkoutDimensionalPackageCount)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Billable Weight</p>
                      <p className="mt-1 font-semibold">
                        {formatWeight(checkoutData.chargeableWeight, checkoutData.chargeableWeightUnit)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        Extra {checkoutData.chargeableWeightUnit || "KG"} Charge
                      </span>
                      <span className="font-medium">
                        <SarAmount amount={checkoutExtraKgCharge} />
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span>Total Amount</span>
                  <span className="font-bold text-lg">
                    <SarAmount amount={checkoutData.amount} />
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <TapCardForm
                  amount={checkoutData.amount}
                  currency={checkoutData.currency}
                  shipmentId={checkoutData.shipmentId}
                  submitLabel="Pay Now"
                  pending={createShipmentPaymentMutation.isPending || confirmMutation.isPending}
                  onSubmit={(payload) =>
                    createShipmentPaymentMutation.mutate({
                      shipmentId: checkoutData.shipmentId,
                      tapTokenId: payload.tapTokenId,
                      saveCardForFuture: payload.saveCardForFuture,
                    })
                  }
                  testId="button-pay-now"
                />

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t" />
                  <span className="px-3 text-xs text-muted-foreground uppercase">or</span>
                  <div className="flex-grow border-t" />
                </div>

                {creditAccess?.creditEnabled ? (
                  <div className="p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <Clock className="h-4 w-4" />
                      Credit / Pay Later
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Create your shipment now and receive an invoice with 30-day payment terms. You will receive email reminders before the due date.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (checkoutData?.shipmentId) {
                          payLaterMutation.mutate(checkoutData.shipmentId);
                        }
                      }}
                      disabled={payLaterMutation.isPending || createShipmentPaymentMutation.isPending}
                      className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                      data-testid="button-pay-later"
                    >
                      {payLaterMutation.isPending ? (
                        <><LoadingSpinner size="sm" className="mr-2" />Creating Credit Invoice...</>
                      ) : (
                        <>Use Credit / Pay Later</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 border border-muted rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Credit / Pay Later
                    </div>
                    {creditAccess?.request?.status === "pending" ? (
                      <p className="text-sm text-muted-foreground">
                        Your credit access request is pending review. You will be notified once it is approved.
                      </p>
                    ) : creditAccess?.request?.status === "rejected" ? (
                      <p className="text-sm text-muted-foreground">
                        Your credit access request was not approved. Please contact support for more information.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Credit / Pay Later is not enabled for your account. You can request access from your Billing page.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                onClick={() => setStep(isInternationalShipment ? customsStep : 5)}
                data-testid="button-prev"
              >
                Back
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === confirmationStep && quoteMode && quotationSent && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Quotation sent to client</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Quotation <span className="font-mono">{quotationSent.trackingNumber}</span> was created for{" "}
                <span className="font-medium">{quotation?.clientName || "the client"}</span> and they've been notified to review, modify and pay.
              </p>
              <Button onClick={() => navigate("/admin/shipments")}>Back to shipments</Button>
            </CardContent>
          </Card>
        )}

        {step === confirmationStep && !quoteMode && confirmData && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Shipment Created Successfully!</CardTitle>
              <CardDescription>Your shipment has been booked with the carrier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Shipment ID</span>
                  <span className="font-mono">{confirmData.shipment?.trackingNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Carrier Tracking</span>
                  <CarrierTrackingLink
                    trackingNumber={confirmData.carrierTrackingNumber}
                    carrierCode={confirmData.shipment?.carrierCode}
                    carrierName={confirmData.shipment?.carrierName}
                  />
                </div>
                {confirmData.estimatedDelivery && (
                  <div className="flex justify-between text-sm">
                    <span>Estimated Delivery</span>
                    <span>{format(new Date(confirmData.estimatedDelivery), "MMM d, yyyy")}</span>
                  </div>
                )}
                {confirmData.shipment?.pickupConfirmationNumber ? (
                  <div className="flex justify-between text-sm">
                    <span>Pickup Number</span>
                    <span className="font-mono font-medium">{confirmData.shipment.pickupConfirmationNumber}</span>
                  </div>
                ) : confirmData.shipment?.pickupRequested ? (
                  <div className="flex justify-between text-sm">
                    <span>Pickup</span>
                    <span className="text-muted-foreground">Booking{confirmData.shipment?.pickupDate ? ` for ${confirmData.shipment.pickupDate}` : ""} — number will appear on the shipment shortly</span>
                  </div>
                ) : null}
              </div>
              {confirmData.labelUrl && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={confirmData.labelUrl} target="_blank" rel="noopener noreferrer">
                    Download Shipping Label
                  </a>
                </Button>
              )}
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => navigate("/client/shipments")} data-testid="button-done">
                View All Shipments
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      <Sheet open={itemSheetOpen} onOpenChange={setItemSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto" data-testid="sheet-item-form">
          <SheetHeader>
            <SheetTitle>{editingItemIndex !== null ? "Edit Item" : "Add Item"}</SheetTitle>
            <SheetDescription>
              Fill in the item details for customs clearance
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Item Name *</Label>
              <Input
                value={editingItem.itemName}
                onChange={(e) => updateEditingItem("itemName", e.target.value)}
                placeholder="e.g. Wireless Bluetooth Headphones"
                data-testid="input-sheet-item-name"
              />
              {isGenericItemName(editingItem.itemName) && editingItem.itemName.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Name is too generic. Add more detail for better HS accuracy.
                </p>
              )}
            </div>

            <div>
              <Label>Category *</Label>
              <Select
                value={editingItem.category}
                onValueChange={(v) => updateEditingItem("category", v)}
              >
                <SelectTrigger data-testid="select-sheet-item-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {itemCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Country of Origin *</Label>
              <SearchableSelect
                value={editingItem.countryOfOrigin}
                onValueChange={(v) => updateEditingItem("countryOfOrigin", v)}
                options={COUNTRY_CODE_SELECT_OPTIONS}
                placeholder="Select origin country"
                searchPlaceholder="Search countries..."
                data-testid="select-sheet-item-origin"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit Price *</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={editingItem.price}
                  onChange={(e) => updateEditingItem("price", parseFloat(e.target.value) || 0)}
                  data-testid="input-sheet-item-price"
                />
              </div>
              <div>
                <Label>Currency *</Label>
                <Select
                  value={editingItem.currency}
                  onValueChange={(v) => updateEditingItem("currency", v)}
                >
                  <SelectTrigger data-testid="select-sheet-item-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itemCurrencies.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={editingItem.quantity}
                onChange={(e) => updateEditingItem("quantity", parseInt(e.target.value) || 1)}
                data-testid="input-sheet-item-qty"
              />
            </div>

            <div className="border-t pt-4 space-y-3">
              <div>
                <Label>Item Description</Label>
                <Textarea
                  value={editingItem.itemDescription}
                  onChange={(e) => updateEditingItem("itemDescription", e.target.value)}
                  placeholder="Detailed description for customs classification..."
                  rows={2}
                  data-testid="input-sheet-item-desc"
                />
              </div>
              <div>
                <Label>Material</Label>
                <Input
                  value={editingItem.material}
                  onChange={(e) => updateEditingItem("material", e.target.value)}
                  placeholder="e.g. ABS Plastic, Cotton, Stainless Steel"
                  data-testid="input-sheet-item-material"
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">HS Code</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={lookupHsCodeForSheet}
                  disabled={(hsLookupLoading as any).sheet || !editingItem.itemName || !editingItem.category || !editingItem.countryOfOrigin}
                  data-testid="button-sheet-lookup-hs"
                >
                  {(hsLookupLoading as any).sheet ? (
                    <><LoadingSpinner size="sm" className="mr-1" /> Looking up...</>
                  ) : (
                    <><Search className="h-3 w-3 mr-1" /> Lookup HS Code</>
                  )}
                </Button>
              </div>

              {editingItem.hsCodeCandidates.length > 0 && !editingItem.hsManualEntry && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Suggested codes ({editingItem.hsCodeSource})</Label>
                  <Select
                    value={editingItem.hsCode}
                    onValueChange={(v) => {
                      const candidate = editingItem.hsCodeCandidates.find(c => c.code === v);
                      updateEditingItem("hsCode", v);
                      if (candidate) {
                        updateEditingItem("hsCodeConfidence", confidenceFromNumber(candidate.confidence));
                      }
                      confirmHsCodeForSheet(v);
                    }}
                  >
                    <SelectTrigger data-testid="select-sheet-hs-code">
                      <SelectValue placeholder="Select HS code" />
                    </SelectTrigger>
                    <SelectContent>
                      {editingItem.hsCodeCandidates.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code} - {c.description.substring(0, 50)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editingItem.hsManualEntry && (
                <div>
                  <Input
                    value={editingItem.hsCode}
                    onChange={(e) => {
                      updateEditingItem("hsCode", e.target.value);
                      updateEditingItem("hsCodeSource", "USER");
                      updateEditingItem("hsCodeConfidence", e.target.value.length >= 6 ? "HIGH" : "MEDIUM");
                    }}
                    placeholder="Enter HS code (e.g. 847130)"
                    data-testid="input-sheet-hs-manual"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => updateEditingItem("hsManualEntry", !editingItem.hsManualEntry)}
                  data-testid="button-sheet-toggle-manual-hs"
                >
                  {editingItem.hsManualEntry ? "Use suggested" : "Enter manually"}
                </Button>
                {editingItem.hsCode && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    {editingItem.hsCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setItemSheetOpen(false)} data-testid="button-sheet-cancel">
              Cancel
            </Button>
            <Button onClick={saveItemFromSheet} data-testid="button-sheet-save-item">
              {editingItemIndex !== null ? "Update Item" : "Add Item"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </QuoteShell>
  );
}
