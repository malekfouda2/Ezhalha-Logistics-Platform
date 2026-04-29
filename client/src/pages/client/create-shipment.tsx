import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { TapCardForm } from "@/components/tap-card-form";
import { LoadingSpinner, LoadingScreen } from "@/components/loading-spinner";
import { SearchableSelect } from "@/components/searchable-select";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Package, MapPin, Truck, Check, CreditCard, Clock, Plus, Trash2, Search, AlertTriangle, CheckCircle, Pencil, Upload, FileText, X } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import { Link } from "wouter";
import { COUNTRY_CODE_SELECT_OPTIONS } from "@/lib/countries";
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

interface ShipmentFormData {
  shipmentType: "domestic" | "inbound" | "outbound";
  isDdp: boolean;
  carrier: string;
  serviceType: string;
  shipper: {
    name: string;
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
    weight: number;
    length: number;
    width: number;
    height: number;
  }>;
  items: ItemFormData[];
  tradeDocuments: ShipmentTradeDocument[];
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
}

interface RatesResponse {
  quotes: RateQuote[];
  expiresAt: string;
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

interface CheckoutResponse {
  shipmentId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  carrierCode?: string;
  carrierName?: string;
  serviceType?: string;
  serviceName?: string;
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

const POSTAL_CODE_EXEMPT_COUNTRIES = new Set([
  "AE", "QA", "BH", "OM", "HK", "IE", "AG", "AW", "BS", "BZ", "BJ", "BW",
  "BF", "BI", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "DM", "GQ",
  "ER", "FJ", "GA", "GM", "GH", "GD", "GN", "GW", "GY", "KI", "KP", "LY",
  "MW", "ML", "MR", "NA", "NR", "PA", "RW", "KN", "LC", "ST", "SC",
  "SL", "SB", "SO", "SR", "SY", "TL", "TG", "TO", "TV", "UG", "VU", "YE", "ZW",
]);

const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA"]);

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
];

function CarrierMark({ carrierCode }: { carrierCode: string }) {
  if (carrierCode === "FEDEX") {
    return (
      <div className="inline-flex items-center justify-center" aria-label="FedEx">
        <span className="text-2xl font-black tracking-tight">
          <span className="text-[#4D148C]">Fed</span>
          <span className="text-[#FF6600]">Ex</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative inline-flex min-w-[120px] items-center justify-center overflow-hidden rounded-md bg-[#FFCC00] px-5 py-2"
      aria-label="DHL"
    >
      <span className="absolute inset-x-0 top-2 h-0.5 bg-[#D40511]" />
      <span className="absolute inset-x-0 bottom-2 h-0.5 bg-[#D40511]" />
      <span className="text-xl font-black tracking-[0.28em] text-[#D40511]">DHL</span>
    </div>
  );
}

function titleCaseLabel(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

const shipmentTypeOptions = [
  { value: "domestic", label: "Domestic", description: "Shipping within Saudi Arabia" },
  { value: "inbound", label: "Inbound", description: "International shipping into a country" },
  { value: "outbound", label: "Outbound", description: "International shipping out of a country" },
];

const DDP_DESTINATION_COUNTRIES = new Set(["SA", "AE"]);

interface MyPermissions {
  permissions: string[];
  isPrimaryContact: boolean;
}

export default function CreateShipment() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmResponse | null>(null);
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);

  const [formData, setFormData] = useState<ShipmentFormData>({
    shipmentType: "" as "domestic" | "inbound" | "outbound",
    isDdp: false,
    carrier: "",
    serviceType: "",
    shipper: {
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
    },
    recipient: {
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
    },
    packages: [
      { weight: 1, length: 10, width: 10, height: 10 },
    ],
    items: [{ ...defaultItem }],
    tradeDocuments: [],
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

  const { uploadFile: uploadInvoiceFile, isUploading: isUploadingInvoice } = useUpload({
    onError: (error) => {
      toast({
        title: "Invoice upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  // Helper function to create address from account's default shipping address
  const getAccountShippingAddress = () => {
    if (!account) return null;
    return {
      name: account.shippingContactName || account.name || "",
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
      };
      const res = await apiRequest("POST", "/api/client/shipments/rates", payload);
      return res.json() as Promise<RatesResponse>;
    },
    onSuccess: (data) => {
      setSelectedQuoteId(null);
      setRates(data);
      setCheckoutData(null);
      setConfirmData(null);
      setStep(5);
    },
    onError: (error) => {
      toast({
        title: "Failed to get rates",
        description: error instanceof Error ? error.message : "Please try again",
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
    }) => {
      const res = await apiRequest("POST", "/api/client/shipments/checkout", payload);
      return res.json() as Promise<CheckoutResponse>;
    },
    onSuccess: (data) => {
      setCheckoutData(data);
      setStep(paymentStep);
    },
    onError: (error) => {
      toast({
        title: "Failed to process checkout",
        description: error instanceof Error ? error.message : "Please try again",
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
      const res = await apiRequest("POST", "/api/client/shipments/pay", payload);
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
      navigate("/client/shipments/new", { replace: true });
    },
    onError: (error: any) => {
      const is502 = error?.status === 502 || (error instanceof Error && error.message?.includes("carrier"));
      toast({
        title: is502 ? "Carrier Error" : "Failed to confirm shipment",
        description: is502
          ? "The carrier could not process this shipment. Please retry or contact support."
          : (error instanceof Error ? error.message : "Please try again"),
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
          : (error instanceof Error ? error.message : "Please try again"),
        variant: "destructive",
      });
    },
  });

  const { data: myPerms, isLoading: permsLoading } = useQuery<MyPermissions>({
    queryKey: ["/api/client/my-permissions"],
  });

  const { data: creditAccess } = useQuery<{ creditEnabled: boolean; request: any }>({
    queryKey: ["/api/client/credit-access"],
  });

  const canCreateShipments = myPerms?.isPrimaryContact || myPerms?.permissions.includes("create_shipments");
  const ddpEligibleDestination =
    formData.shipmentType === "inbound" &&
    DDP_DESTINATION_COUNTRIES.has((formData.recipient.countryCode || "").toUpperCase());
  const invoiceDocument = formData.tradeDocuments[0] ?? null;
  const isInternationalShipment =
    formData.shipmentType === "inbound" || formData.shipmentType === "outbound";
  const customsStep = 6;
  const paymentStep = isInternationalShipment ? 7 : 6;
  const confirmationStep = paymentStep + 1;
  const selectedQuote = rates?.quotes.find((quote) => quote.quoteId === selectedQuoteId) ?? null;
  const selectedCarrierCode = selectedQuote?.carrierCode || formData.carrier || "";

  useEffect(() => {
    if (!ddpEligibleDestination && formData.isDdp) {
      setFormData((prev) => ({ ...prev, isDdp: false }));
    }
  }, [ddpEligibleDestination, formData.isDdp]);

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

  // Permission check - show access denied if user lacks create_shipments permission
  if (permsLoading) {
    return <LoadingScreen />;
  }

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
        "/api/client/shipments/extract-invoice-items",
        {
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
      await apiRequest("POST", "/api/client/hs-code/confirm", {
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
      await apiRequest("POST", "/api/client/hs-code/confirm", {
        itemName: item.itemName,
        category: item.category,
        material: item.material || undefined,
        countryOfOrigin: item.countryOfOrigin,
        hsCode: item.hsCode,
        description: item.hsCodeCandidates.find(c => c.code === item.hsCode)?.description,
      });
    } catch {}
  };

  const isPostalRequired = (countryCode: string) => {
    return countryCode && !POSTAL_CODE_EXEMPT_COUNTRIES.has(countryCode.toUpperCase());
  };

  const isStateRequired = (countryCode: string) => {
    return STATE_REQUIRED_COUNTRIES.has(countryCode.toUpperCase());
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
        toast({ title: `Postal code is required for ${countryCode}`, variant: "destructive" });
        return false;
      }
      if (countryCode === "SA" && !shortAddress) {
        toast({ title: "Short address is required for KSA addresses", variant: "destructive" });
        return false;
      }
      if (isStateRequired(countryCode) && !stateOrProvince) {
        toast({ title: "State/Province is required for US and Canada addresses", variant: "destructive" });
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
        toast({ title: `Postal code is required for ${countryCode}`, variant: "destructive" });
        return false;
      }
      if (countryCode === "SA" && !shortAddress) {
        toast({ title: "Short address is required for KSA addresses", variant: "destructive" });
        return false;
      }
      if (isStateRequired(countryCode) && !stateOrProvince) {
        toast({ title: "State/Province is required for US and Canada addresses", variant: "destructive" });
        return false;
      }
      if (formData.shipmentType === "inbound" && formData.isDdp && !ddpEligibleDestination) {
        toast({
          title: "DDP is only available for imports to Saudi Arabia or the UAE",
          variant: "destructive",
        });
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
    } else if (currentStep === 5) {
      if (!selectedQuoteId || !selectedQuote) {
        toast({ title: "Please select a shipping rate", variant: "destructive" });
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
    } = {
      quoteId: selectedQuoteId,
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

  const nextStep = () => {
    if (!validateStep(step)) {
      return;
    }

    if (step === 4) {
      getRatesMutation.mutate(formData);
      return;
    }

    if (step === 5) {
      if (isInternationalShipment) {
        setStep(customsStep);
        return;
      }

      const payload = buildCheckoutPayload();
      if (payload) {
        checkoutMutation.mutate(payload);
      }
      return;
    }

    if (step === customsStep && isInternationalShipment) {
      const payload = buildCheckoutPayload();
      if (payload) {
        checkoutMutation.mutate(payload);
      }
      return;
    }

    setStep(step + 1);
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const stepTitles = isInternationalShipment
    ? [
        "Shipment Type",
        "Sender Details",
        "Recipient Details",
        "Package Details",
        "Select Rate",
        "Customs Details",
        "Payment",
        "Confirmation",
      ]
    : [
        "Shipment Type",
        "Sender Details",
        "Recipient Details",
        "Package Details",
        "Select Rate",
        "Payment",
        "Confirmation",
      ];

  const senderNeedsShortAddress = formData.shipper.countryCode === "SA";
  const recipientNeedsShortAddress = formData.recipient.countryCode === "SA";

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/client/shipments">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Shipments
          </Button>
        </Link>

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
                <Label>Full Name *</Label>
                <Input
                  value={formData.shipper.name}
                  onChange={(e) => updateShipper("name", e.target.value)}
                  placeholder="Sender's full name"
                  data-testid="input-shipper-name"
                />
              </div>
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
                  <Input
                    value={formData.shipper.city}
                    onChange={(e) => updateShipper("city", e.target.value)}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Postal Code {isPostalRequired(formData.shipper.countryCode) ? "*" : ""}</Label>
                  <Input
                    value={formData.shipper.postalCode}
                    onChange={(e) => updateShipper("postalCode", e.target.value)}
                    placeholder="Postal code"
                    data-testid="input-shipper-postal"
                  />
                </div>
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={formData.shipper.phone}
                    onChange={(e) => updateShipper("phone", e.target.value)}
                    placeholder="+1 234 567 890"
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
                <Label>Full Name *</Label>
                <Input
                  value={formData.recipient.name}
                  onChange={(e) => updateRecipient("name", e.target.value)}
                  placeholder="Recipient's full name"
                  data-testid="input-recipient-name"
                />
              </div>
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
                  <Input
                    value={formData.recipient.city}
                    onChange={(e) => updateRecipient("city", e.target.value)}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Postal Code {isPostalRequired(formData.recipient.countryCode) ? "*" : ""}</Label>
                  <Input
                    value={formData.recipient.postalCode}
                    onChange={(e) => updateRecipient("postalCode", e.target.value)}
                    placeholder="Postal code"
                    data-testid="input-recipient-postal"
                  />
                </div>
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
              </div>
              {formData.shipmentType === "inbound" && (
                <div className="rounded-lg border p-4 space-y-3" data-testid="card-ddp-option">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label htmlFor="ddp-toggle" className="text-sm font-medium cursor-pointer">
                          Delivered Duty Paid (DDP)
                        </Label>
                        <Badge variant={formData.isDdp ? "default" : "secondary"}>
                          {formData.isDdp ? "DDP Import" : "Standard Import"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Use DDP when Ezhalha should treat this import as seller-paid delivery responsibility.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available only for imports to Saudi Arabia or the UAE.
                      </p>
                    </div>
                    <Switch
                      id="ddp-toggle"
                      checked={formData.isDdp}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isDdp: checked }))}
                      disabled={!ddpEligibleDestination}
                      data-testid="switch-ddp"
                    />
                  </div>
                  {!ddpEligibleDestination && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Select Saudi Arabia or UAE as the destination country to enable DDP.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={formData.recipient.phone}
                    onChange={(e) => updateRecipient("phone", e.target.value)}
                    placeholder="+1 234 567 890"
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

              <div className="space-y-4">
                {formData.packages.map((pkg, index) => (
                  <Card key={index} className="relative">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4">
                      <CardTitle className="text-sm font-medium">
                        Package {index + 1}
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
                    </CardContent>
                  </Card>
                ))}
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
                ) : (
                  "Get Shipping Rates"
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 5 && rates && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Select Shipping Rate
              </CardTitle>
              <CardDescription>
                Choose your preferred shipping option. Rates expire at {format(new Date(rates.expiresAt), "h:mm a")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedQuoteId || ""}
                onValueChange={setSelectedQuoteId}
                className="grid gap-6 md:grid-cols-2"
              >
                {carriers.map((carrier) => {
                  const carrierQuotes = rates.quotes.filter((quote) => quote.carrierCode === carrier.code);

                  return (
                    <div key={carrier.code} className="rounded-2xl border bg-card/60 p-4 md:p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3 border-b pb-4">
                        <CarrierMark carrierCode={carrier.code} />
                        <Badge variant="secondary" className="shrink-0">
                          {carrierQuotes.length} option{carrierQuotes.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

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
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(4)} data-testid="button-prev">Back</Button>
              <Button
                onClick={nextStep}
                disabled={!selectedQuoteId || (!isInternationalShipment && checkoutMutation.isPending)}
                data-testid="button-continue-from-rates"
              >
                {!isInternationalShipment && checkoutMutation.isPending
                  ? "Processing..."
                  : isInternationalShipment
                    ? "Continue to Customs Details"
                    : "Proceed to Payment"}
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
                              Qty: {item.quantity} × {item.price.toFixed(2)} {item.currency}
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
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(5)} data-testid="button-prev">Back</Button>
              <Button
                onClick={nextStep}
                disabled={checkoutMutation.isPending}
                data-testid="button-checkout"
              >
                {checkoutMutation.isPending ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Processing...</>
                ) : (
                  <>Proceed to Payment</>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === paymentStep && checkoutData && (
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
                <div className="flex justify-between text-sm mt-2">
                  <span>Total Amount</span>
                  <span className="font-bold text-lg">
                    <SarAmount amount={checkoutData.amount} /> {checkoutData.currency}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <TapCardForm
                  amount={checkoutData.amount}
                  currency={checkoutData.currency}
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

        {step === confirmationStep && confirmData && (
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
                  <span className="font-mono">{confirmData.carrierTrackingNumber}</span>
                </div>
                {confirmData.estimatedDelivery && (
                  <div className="flex justify-between text-sm">
                    <span>Estimated Delivery</span>
                    <span>{format(new Date(confirmData.estimatedDelivery), "MMM d, yyyy")}</span>
                  </div>
                )}
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
                  step="0.01"
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
    </ClientLayout>
  );
}
