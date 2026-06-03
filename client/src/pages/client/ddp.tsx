import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClientLayout } from "@/components/client-layout";
import { TapCardForm } from "@/components/tap-card-form";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Globe2,
  House,
  Info,
  MapPin,
  NotebookPen,
  Package,
  PackagePlus,
  Plane,
  ShieldCheck,
  Ship,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import { FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES } from "@shared/schema";

type Address = {
  name: string;
  phone: string;
  email: string;
  countryCode: string;
  city: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
  stateOrProvince?: string;
};
type DdpPackage = { weight: number; length: number; width: number; height: number };
type Item = { itemName: string; itemDescription: string; category: string; countryOfOrigin: string; hsCode?: string; price: number; quantity: number; currency: string };
type TradeDocument = { fileName: string; objectPath: string; contentType: string; size: number; documentType: "COMMERCIAL_INVOICE" | "OTHER" };
type Quote = {
  quoteId: string;
  expiresAt: string;
  pricing: {
    billingUnit: "KG" | "CBM";
    billableQuantity: number;
    ratePerUnitSar: number;
    baseRateSar: number;
    markupAmountSar: number;
    totalAmountSar: number;
    actualWeightKg: number;
    dimensionalWeightKg: number;
    totalCbm: number;
    packages: Array<{
      index: number;
      actualWeightKg: number;
      dimensionalWeightKg: number;
      chargeableWeightKg: number;
      usesDimensionalWeight: boolean;
    }>;
    transitDaysMin?: number | null;
    transitDaysMax?: number | null;
  };
};
type Checkout = { shipmentId: string; trackingNumber: string; amount: number; currency: string; pricing: Quote["pricing"] };
type ClientAccount = {
  profile: string;
  name: string;
  email: string;
  phone: string;
  shippingContactName?: string | null;
  shippingContactPhone?: string | null;
  shippingCountryCode?: string | null;
  shippingStateOrProvince?: string | null;
  shippingCity?: string | null;
  shippingPostalCode?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
};

const stepTitles = [
  "Shipment Method",
  "Origin Country",
  "Recipient Details",
  "Supplier Details",
  "Package Details",
  "Select Rate",
  "Documents",
  "Notes & Terms",
  "Payment",
  "Confirmation",
];
const emptyAddress = (): Address => ({ name: "", phone: "", email: "", countryCode: "", city: "", postalCode: "", addressLine1: "", addressLine2: "", stateOrProvince: "" });
const emptyItem = (): Item => ({ itemName: "", itemDescription: "", category: "", countryOfOrigin: "", price: 0, quantity: 1, currency: "SAR" });
const contentTypeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};
function normalizeFile(file: File): File {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const contentType = file.type || contentTypeByExtension[extension] || "application/octet-stream";
  return file.type === contentType ? file : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
}
function fileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ClientDdp() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [transportMethod, setTransportMethod] = useState<"air" | "sea">("air");
  const [shipper, setShipper] = useState<Address>(emptyAddress);
  const [recipient, setRecipient] = useState<Address>(emptyAddress);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [packages, setPackages] = useState<DdpPackage[]>([{ weight: 1, length: 10, width: 10, height: 10 }]);
  const [totalCbm, setTotalCbm] = useState(0);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [documents, setDocuments] = useState<TradeDocument[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [accepted, setAccepted] = useState({ customs: false, terms: false, broker: false });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [isExtractingInvoice, setIsExtractingInvoice] = useState(false);
  const [isExtractingPackingList, setIsExtractingPackingList] = useState(false);
  const hasPrefilledRecipient = useRef(false);
  const upload = useUpload({ onError: (error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }) });
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: lanes = [] } = useQuery<Array<{ originCountryCode: string; originCity?: string | null; destinationCountryCode: string; destinationCity?: string | null; airAvailable: boolean; seaAvailable: boolean }>>({
    queryKey: ["/api/client/ddp/lanes"],
  });
  const { data: creditAccess } = useQuery<{ creditEnabled: boolean; request?: { status?: string } }>({ queryKey: ["/api/client/credit-access"] });

  useEffect(() => {
    if (!account || hasPrefilledRecipient.current) return;
    hasPrefilledRecipient.current = true;
    setRecipient({
      name: account.shippingContactName || account.name || "",
      phone: account.shippingContactPhone || account.phone || "",
      email: account.email || "",
      countryCode: account.shippingCountryCode || "",
      city: account.shippingCity || "",
      postalCode: account.shippingPostalCode || "",
      addressLine1: account.shippingAddressLine1 || "",
      addressLine2: account.shippingAddressLine2 || "",
      stateOrProvince: account.shippingStateOrProvince || "",
    });
  }, [account]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const paymentStatus = params.get("paymentStatus");
    if (!paymentStatus) return;
    if (paymentStatus === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      toast({ title: "Payment completed", description: "Your DDP shipment was submitted successfully." });
      setStep(10);
    } else if (paymentStatus === "failed") {
      toast({ title: "Payment failed", description: params.get("message") || "Your payment could not be completed.", variant: "destructive" });
      navigate("/client/shipments", { replace: true });
      return;
    } else {
      toast({ title: "Payment pending", description: "Your payment is still being processed." });
      navigate("/client/shipments", { replace: true });
      return;
    }
    navigate("/client/ddp", { replace: true });
  }, [navigate, search, toast]);

  const rates = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/ddp/rates", { transportMethod, shipper: { countryCode: shipper.countryCode }, recipient, supplierName, supplierPhone, packages, totalCbm });
      return res.json() as Promise<Quote>;
    },
    onSuccess: (data) => { setQuote(data); setStep(6); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (error) => toast({ title: "Could not calculate DDP pricing", description: errorMessage(error, "Please review the route and package details."), variant: "destructive" }),
  });
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/ddp/checkout", {
        quoteId: quote?.quoteId,
        items: items.filter((item) => item.itemName.trim()),
        tradeDocuments: documents,
        specialInstructions,
        customsComplianceAccepted: accepted.customs,
        termsAccepted: accepted.terms,
        brokerAuthorizationAccepted: accepted.broker,
      });
      return res.json() as Promise<Checkout>;
    },
    onSuccess: (data) => { setCheckout(data); setStep(9); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (error) => toast({ title: "Could not prepare checkout", description: errorMessage(error, "Please review your shipment details."), variant: "destructive" }),
  });
  const confirm = useMutation({
    mutationFn: async ({ shipmentId, paymentIntentId }: { shipmentId: string; paymentIntentId?: string }) => {
      const res = await apiRequest("POST", "/api/client/shipments/confirm", { shipmentId, paymentIntentId });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] }); setStep(10); },
    onError: (error) => toast({ title: "Could not confirm shipment", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });
  const pay = useMutation({
    mutationFn: async ({ tapTokenId, saveCardForFuture }: { tapTokenId?: string; saveCardForFuture?: boolean }) => {
      const res = await apiRequest("POST", "/api/client/shipments/pay", { shipmentId: checkout?.shipmentId, tapTokenId, saveCardForFuture, returnPath: "/client/ddp" });
      return res.json();
    },
    onSuccess: (data) => data.transactionUrl ? window.location.assign(data.transactionUrl) : confirm.mutate({ shipmentId: data.shipmentId, paymentIntentId: data.paymentId }),
    onError: (error) => toast({ title: "Payment could not be started", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });
  const credit = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/client/shipments/${checkout?.shipmentId}/pay-later`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] }); setStep(10); },
    onError: (error) => toast({ title: "Could not use credit", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const commercialInvoice = documents.find((document) => document.documentType === "COMMERCIAL_INVOICE");
  const packingList = documents.find((document) => document.documentType === "OTHER");
  const routeLabel = `${countryName(shipper.countryCode)} → ${recipient.city || countryName(recipient.countryCode)}`;
  const totalWeight = packages.reduce((sum, pkg) => sum + Number(pkg.weight || 0), 0);
  const calculatedCbm = packages.reduce((sum, pkg) => sum + (Number(pkg.length || 0) * Number(pkg.width || 0) * Number(pkg.height || 0)) / 1_000_000, 0);
  const originOptions = Array.from(new Set(lanes.filter((lane) => transportMethod === "air" ? lane.airAvailable : lane.seaAvailable).map((lane) => lane.originCountryCode)));
  const destinationOptions = Array.from(new Set(
    lanes
      .filter((lane) =>
        lane.originCountryCode === shipper.countryCode &&
        (transportMethod === "air" ? lane.airAvailable : lane.seaAvailable),
      )
      .map((lane) => lane.destinationCountryCode),
  ));
  const actualWeightPackageCount = quote?.pricing.packages.filter((pkg) => !pkg.usesDimensionalWeight).length || 0;
  const dimensionalWeightPackageCount = quote?.pricing.packages.filter((pkg) => pkg.usesDimensionalWeight).length || 0;

  useEffect(() => {
    if (recipient.countryCode && !destinationOptions.includes(recipient.countryCode)) {
      setRecipient((current) => ({ ...current, countryCode: "" }));
    }
  }, [destinationOptions.join("|"), recipient.countryCode]);

  const updateAddress = (setter: (value: Address) => void, value: Address, key: keyof Address, nextValue: string) => setter({ ...value, [key]: nextValue });
  const setPackageValue = (index: number, key: keyof DdpPackage, value: number) => setPackages((current) => current.map((pkg, pkgIndex) => pkgIndex === index ? { ...pkg, [key]: value } : pkg));
  const goTo = (nextStep: number) => { setStep(nextStep); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const warn = (description: string) => { toast({ title: "Complete the required details", description, variant: "destructive" }); return false; };
  const next = () => {
    if (step === 1) return goTo(2);
    if (step === 2) {
      if (!shipper.countryCode) return warn("Select an origin country.");
      return goTo(3);
    }
    if (step === 3) {
      if (!recipient.name || !recipient.phone || !recipient.countryCode || !recipient.city || !recipient.postalCode || !recipient.addressLine1) return warn("Complete the recipient address and contact information.");
      return goTo(4);
    }
    if (step === 4) {
      if (!supplierName || !supplierPhone) return warn("Complete the supplier name and phone number.");
      return goTo(5);
    }
    if (step === 5) {
      if (!packages.length) return warn("Add at least one package.");
      if (transportMethod === "air" && packages.some((pkg) => !pkg.weight || !pkg.length || !pkg.width || !pkg.height)) return warn("Enter weight and dimensions for every air-freight package.");
      if (transportMethod === "sea" && !(totalCbm || calculatedCbm)) return warn("Enter shipment volume in CBM.");
      return rates.mutate();
    }
    if (step === 6) return goTo(7);
    if (step === 7) {
      if (!commercialInvoice) return warn("Upload a commercial invoice before continuing.");
      if (!items.some((item) => item.itemName.trim())) return warn("Review the imported items or add at least one item.");
      if (items.some((item) => item.itemName.trim() && (!item.category || item.countryOfOrigin.length !== 2))) return warn("Complete the category and two-letter origin country code for every item.");
      return goTo(8);
    }
    if (step === 8) {
      if (!accepted.customs || !accepted.terms || !accepted.broker) return warn("Accept all required confirmations before payment.");
      return checkoutMutation.mutate();
    }
  };

  const uploadPackingList = async (file?: File) => {
    if (!file) return;
    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) return warn("Upload a packing list up to 20 MB.");
    const result = await upload.uploadFile(normalizeFile(file));
    if (!result) return;
    setDocuments((current) => [...current.filter((entry) => entry.documentType !== "OTHER"), { fileName: result.metadata.name, objectPath: result.objectPath, contentType: result.metadata.contentType, size: result.metadata.size, documentType: "OTHER" }]);
    setIsExtractingPackingList(true);
    try {
      const res = await apiRequest("POST", "/api/client/shipments/extract-package-details", { fileName: result.metadata.name, objectPath: result.objectPath, contentType: result.metadata.contentType });
      const extraction = await res.json();
      if (extraction.packages?.length) setPackages(extraction.packages.map((pkg: any) => ({ weight: Number(pkg.weight || 0), length: Number(pkg.length || 0), width: Number(pkg.width || 0), height: Number(pkg.height || 0) })));
      toast({ title: "Packing list processed", description: "Package details were imported for your review." });
    } catch {
      toast({ title: "Packing list uploaded", description: "Please review the package details manually." });
    } finally {
      setIsExtractingPackingList(false);
    }
  };
  const uploadInvoice = async (file?: File) => {
    if (!file) return;
    if (file.size > FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES) return warn("Upload an invoice up to 20 MB.");
    const result = await upload.uploadFile(normalizeFile(file));
    if (!result) return;
    const document: TradeDocument = { fileName: result.metadata.name, objectPath: result.objectPath, contentType: result.metadata.contentType, size: result.metadata.size, documentType: "COMMERCIAL_INVOICE" };
    setDocuments((current) => [document, ...current.filter((entry) => entry.documentType !== "COMMERCIAL_INVOICE")]);
    setIsExtractingInvoice(true);
    try {
      const res = await apiRequest("POST", "/api/client/shipments/extract-invoice-items", { shipmentType: "inbound", shipperCountryCode: shipper.countryCode, recipientCountryCode: recipient.countryCode, fileName: document.fileName, objectPath: document.objectPath, contentType: document.contentType });
      const extraction = await res.json();
      if (extraction.items?.length) setItems(extraction.items);
      toast({ title: "Invoice processed", description: "Items and HS codes were imported for your review." });
    } catch {
      toast({ title: "Invoice uploaded", description: "Please review and enter the item details manually." });
    } finally {
      setIsExtractingInvoice(false);
    }
  };

  const addressFields = (value: Address, setter: (address: Address) => void) => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1 md:col-span-2"><Label>Full name *</Label><Input value={value.name} onChange={(e) => updateAddress(setter, value, "name", e.target.value)} /></div>
      <div className="space-y-1"><Label>Address line 1 *</Label><Input value={value.addressLine1} onChange={(e) => updateAddress(setter, value, "addressLine1", e.target.value)} /></div>
      <div className="space-y-1"><Label>Address line 2 <span className="text-xs text-muted-foreground">(optional)</span></Label><Input value={value.addressLine2} onChange={(e) => updateAddress(setter, value, "addressLine2", e.target.value)} /></div>
      <div className="space-y-1"><Label>City *</Label><Input value={value.city} onChange={(e) => updateAddress(setter, value, "city", e.target.value)} /></div>
      <div className="space-y-1"><Label>State / Province</Label><Input value={value.stateOrProvince} onChange={(e) => updateAddress(setter, value, "stateOrProvince", e.target.value)} /></div>
      <div className="space-y-1"><Label>Postal code *</Label><Input value={value.postalCode} onChange={(e) => updateAddress(setter, value, "postalCode", e.target.value)} /></div>
      <div className="space-y-1"><Label>Destination country *</Label><Select value={value.countryCode} onValueChange={(countryCode) => updateAddress(setter, value, "countryCode", countryCode)}><SelectTrigger><SelectValue placeholder="Select an available destination" /></SelectTrigger><SelectContent>{destinationOptions.map((code) => <SelectItem value={code} key={code}>{countryName(code)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Phone *</Label><Input value={value.phone} onChange={(e) => updateAddress(setter, value, "phone", e.target.value)} /></div>
      <div className="space-y-1"><Label>Email <span className="text-xs text-muted-foreground">(optional)</span></Label><Input type="email" value={value.email} onChange={(e) => updateAddress(setter, value, "email", e.target.value)} /></div>
    </div>
  );
  const footer = (nextLabel: string, disabled = false) => (
    <CardFooter className="flex justify-between gap-2">
      {step > 1 ? <Button variant="outline" onClick={() => goTo(step - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button> : <div />}
      <Button onClick={next} disabled={disabled}>{nextLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </CardFooter>
  );
  const uploadZone = (kind: "invoice" | "packing", document?: TradeDocument) => (
    <div className="space-y-3">
      {document ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-sm font-medium">{document.fileName}</p><p className="text-xs text-muted-foreground">{fileSize(document.size)} · Processed</p></div></div>
          <Button variant="ghost" size="icon" onClick={() => setDocuments((current) => current.filter((entry) => entry !== document))}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <Label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5">
          <Upload className="h-7 w-7" /><span><strong className="text-foreground">Click to upload</strong> {kind === "invoice" ? "commercial invoice" : "packing list"}</span>
          <span className="text-xs">{kind === "invoice" ? "PDF, DOCX, XLS, JPG, or PNG. Items and HS codes will be extracted automatically." : "Excel or PDF. We will fill weights and dimensions automatically."}</span>
          <input className="hidden" type="file" onChange={(e) => kind === "invoice" ? uploadInvoice(e.target.files?.[0]) : uploadPackingList(e.target.files?.[0])} />
        </Label>
      )}
    </div>
  );

  return <ClientLayout clientProfile={account?.profile}><div className="mx-auto max-w-3xl p-6">
    <div className="mb-6 flex items-center justify-between">
      <Link href="/client/shipments"><Button variant="ghost"><ArrowLeft className="mr-2 h-4 w-4" />Back to Shipments</Button></Link>
      <Badge variant="secondary">Step {step} of {stepTitles.length}</Badge>
    </div>
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {stepTitles.map((title, index) => { const number = index + 1; return <div className="flex items-center" key={title}><div title={title} className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{step > number ? <Check className="h-4 w-4" /> : number}</div>{number < stepTitles.length && <div className={`mx-0.5 h-1 w-5 ${step > number ? "bg-primary" : "bg-muted"}`} />}</div>; })}
      </div>
      <p className="mt-3 text-center text-sm font-medium text-muted-foreground">{stepTitles[step - 1]}</p>
    </div>

    {step === 1 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Shipment method</CardTitle><CardDescription>Choose how your shipment will be transported</CardDescription></CardHeader><CardContent><RadioGroup value={transportMethod} onValueChange={(value) => setTransportMethod(value as "air" | "sea")} className="space-y-3">
      <Label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${transportMethod === "air" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="air" className="mt-1" /><Plane className="h-5 w-5 text-primary" /><div><p className="font-semibold">Air freight <Badge className="ml-2">Fast</Badge></p><p className="mt-1 text-xs text-muted-foreground">Charged by weight (KG) · Faster delivery</p></div></Label>
      <Label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${transportMethod === "sea" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="sea" className="mt-1" /><Ship className="h-5 w-5 text-primary" /><div><p className="font-semibold">Sea freight <Badge variant="secondary" className="ml-2">Economical</Badge></p><p className="mt-1 text-xs text-muted-foreground">Charged by volume (CBM) · More economical for bulk shipments</p></div></Label>
    </RadioGroup></CardContent>{footer("Next: Origin Country")}</Card>}

    {step === 2 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" />Origin country</CardTitle><CardDescription>Select the country you are importing from</CardDescription></CardHeader><CardContent><RadioGroup value={shipper.countryCode} onValueChange={(countryCode) => setShipper({ ...shipper, countryCode })} className="space-y-3">
      {originOptions.map((code) => <Label key={code} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${shipper.countryCode === code ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value={code} /><div><p className="font-semibold">{countryName(code)}</p><p className="mt-1 text-xs text-muted-foreground">Fixed all-inclusive DDP lane pricing available</p></div></Label>)}
      {!originOptions.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No active {transportMethod} DDP lanes are available yet. Please contact support.</div>}
    </RadioGroup></CardContent>{footer("Next: Recipient Details", !shipper.countryCode)}</Card>}

    {step === 3 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Recipient details</CardTitle><CardDescription>Enter the delivery address and contact information</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"><Info className="mt-0.5 h-4 w-4 shrink-0" />Pre-filled with your default shipping address. Edit if needed.</div>{addressFields(recipient, setRecipient)}</CardContent>{footer("Next: Supplier Details")}</Card>}

    {step === 4 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5" />Supplier details</CardTitle><CardDescription>Enter the supplier contact details. Our team will coordinate pickup manually.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2"><div className="space-y-1"><Label>Supplier name *</Label><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></div><div className="space-y-1"><Label>Phone number *</Label><Input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} /></div></div></CardContent>{footer("Next: Package Details")}</Card>}

    {step === 5 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Package details</CardTitle><CardDescription>Describe your shipment to get an accurate all-inclusive rate</CardDescription></CardHeader><CardContent className="space-y-6">
      <div><p className="mb-3 text-sm font-semibold">Packing list <span className="font-normal text-muted-foreground">(auto-calculates dimensions)</span></p>{uploadZone("packing", packingList)}{isExtractingPackingList && <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" />Processing packing list...</div>}</div>
      <div className="border-t pt-5"><p className="mb-4 text-sm font-semibold text-muted-foreground">Or enter manually</p>{transportMethod === "sea" && <div className="mb-4 space-y-1"><Label>Total volume (CBM)</Label><Input type="number" min="0" step="0.1" value={totalCbm || ""} onChange={(e) => setTotalCbm(Number(e.target.value))} placeholder="Optional if carton dimensions are entered" /></div>}
        <div className="space-y-3">{packages.map((pkg, index) => <div key={index} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Package {index + 1}</p>{packages.length > 1 && <Button variant="ghost" size="icon" onClick={() => setPackages(packages.filter((_, pkgIndex) => pkgIndex !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div><div className="grid gap-3 md:grid-cols-4">{(["weight", "length", "width", "height"] as const).map((key) => <div className="space-y-1" key={key}><Label>{key === "weight" ? "Weight (KG)" : `${key[0].toUpperCase()}${key.slice(1)} (CM)`}{transportMethod === "air" ? " *" : ""}</Label><Input type="number" min="0" step="0.1" value={pkg[key]} onChange={(e) => setPackageValue(index, key, Number(e.target.value))} /></div>)}</div></div>)}</div>
        <Button variant="outline" className="mt-3 w-full" onClick={() => setPackages([...packages, { weight: 1, length: 10, width: 10, height: 10 }])}><PackagePlus className="mr-2 h-4 w-4" />Add package</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3"><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase text-muted-foreground">Packages</p><p className="mt-2 text-2xl font-semibold">{packages.length}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase text-muted-foreground">Total weight</p><p className="mt-2 text-2xl font-semibold">{totalWeight.toFixed(2)} <span className="text-sm text-muted-foreground">KG</span></p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase text-muted-foreground">Total volume</p><p className="mt-2 text-2xl font-semibold">{(totalCbm || calculatedCbm).toFixed(3)} <span className="text-sm text-muted-foreground">CBM</span></p></div></div>
    </CardContent>{footer(rates.isPending ? "Calculating..." : "Get Shipping Rate", rates.isPending)}</Card>}

    {step === 6 && quote && <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Select rate</CardTitle><CardDescription>Your all-inclusive rate. Shipping, customs, and door delivery included.</CardDescription></CardHeader><CardContent><div className="rounded-xl border border-primary bg-primary/5 p-5"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 font-semibold">{transportMethod === "air" ? <Plane className="h-5 w-5 text-primary" /> : <Ship className="h-5 w-5 text-primary" />}{transportMethod === "air" ? "Air freight" : "Sea freight"} · {routeLabel}</p><p className="mt-2 text-sm text-muted-foreground">{quote.pricing.billableQuantity} {quote.pricing.billingUnit} · Estimated transit: {quote.pricing.transitDaysMin || "TBD"}-{quote.pricing.transitDaysMax || "TBD"} days</p>{transportMethod === "air" && <p className="mt-2 text-xs text-muted-foreground">{actualWeightPackageCount} package{actualWeightPackageCount === 1 ? "" : "s"} charged on actual weight · {dimensionalWeightPackageCount} package{dimensionalWeightPackageCount === 1 ? "" : "s"} charged on dimensional weight</p>}<div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">Customs included</Badge><Badge variant="secondary">Door to Door</Badge><Badge variant="secondary">All taxes included</Badge></div></div><div className="text-right"><p className="text-2xl font-bold">SAR {quote.pricing.totalAmountSar.toFixed(2)}</p><p className="mt-1 text-xs uppercase text-muted-foreground">All inclusive</p></div></div></div><p className="mt-3 text-xs text-muted-foreground">Rate valid until {format(new Date(quote.expiresAt), "h:mm a")}.</p></CardContent>{footer("Continue to Documents")}</Card>}

    {step === 7 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Documents</CardTitle><CardDescription>Upload required documents and review customs items</CardDescription></CardHeader><CardContent className="space-y-6"><div><p className="mb-3 text-sm font-semibold">Commercial invoice *</p>{uploadZone("invoice", commercialInvoice)}{isExtractingInvoice && <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" />Processing invoice and matching HS codes...</div>}</div><div className="border-t pt-5"><p className="mb-3 text-sm font-semibold">Packing list <span className="font-normal text-muted-foreground">(optional)</span></p>{uploadZone("packing", packingList)}</div><div className="border-t pt-5"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Invoice items</p><Button variant="outline" size="sm" onClick={() => setItems([...items, emptyItem()])}>Add item</Button></div><div className="space-y-3">{items.map((item, index) => <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-7" key={index}><Input placeholder="Item name" value={item.itemName} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, itemName: e.target.value } : current))} /><Input placeholder="Category" value={item.category} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, category: e.target.value } : current))} /><Input placeholder="Origin" maxLength={2} value={item.countryOfOrigin} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, countryOfOrigin: e.target.value.toUpperCase() } : current))} /><Input type="number" min="1" step="1" placeholder="Qty" value={item.quantity} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, quantity: Number(e.target.value) } : current))} /><Input type="number" min="0" step="0.01" placeholder="Price" value={item.price} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, price: Number(e.target.value) } : current))} /><Input placeholder="HS code" value={item.hsCode || ""} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, hsCode: e.target.value } : current))} /><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></div></CardContent>{footer("Continue")}</Card>}

    {step === 8 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5" />Notes & terms</CardTitle><CardDescription>Add special instructions and confirm your agreement</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-1"><Label>Special instructions <span className="text-xs text-muted-foreground">(optional)</span></Label><Textarea rows={5} placeholder="Fragile items, call before delivery, or specific unloading requirements..." value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} /></div><div className="space-y-3 border-t pt-5"><Label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-normal"><Checkbox className="mt-0.5" checked={accepted.customs} onCheckedChange={(checked) => setAccepted({ ...accepted, customs: checked === true })} />I confirm that the shipment contents are accurate and comply with customs regulations and import laws.</Label><Label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-normal"><Checkbox className="mt-0.5" checked={accepted.terms} onCheckedChange={(checked) => setAccepted({ ...accepted, terms: checked === true })} /><span>I agree to Ezhalha's <a className="font-medium text-primary underline underline-offset-2" href="/policy/terms-and-conditions" target="_blank" rel="noreferrer">Terms & Conditions</a> and <a className="font-medium text-primary underline underline-offset-2" href="/policy/shipping-return-policy" target="_blank" rel="noreferrer">Shipping & Return Policy</a>.</span></Label><Label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-normal"><Checkbox className="mt-0.5" checked={accepted.broker} onCheckedChange={(checked) => setAccepted({ ...accepted, broker: checked === true })} />I authorize Ezhalha to act as my customs broker and clearance agent for this shipment.</Label></div></CardContent>{footer(checkoutMutation.isPending ? "Preparing checkout..." : "Continue to Payment", checkoutMutation.isPending)}</Card>}

    {step === 9 && checkout && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment options</CardTitle><CardDescription>Choose how you'd like to pay for this shipment</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2 rounded-lg bg-muted p-4 text-sm"><div className="flex justify-between gap-3"><span>Shipment ID</span><span className="font-mono text-primary">{checkout.trackingNumber}</span></div><div className="flex justify-between gap-3"><span>Route</span><span className="font-medium">{routeLabel}</span></div><div className="flex justify-between gap-3"><span>Method</span><span className="font-medium">{transportMethod === "air" ? "Air freight" : "Sea freight"} · Door to Door</span></div><div className="flex justify-between gap-3"><span>Billable quantity</span><span className="font-medium">{checkout.pricing.billableQuantity} {checkout.pricing.billingUnit}</span></div><div className="mt-3 flex justify-between border-t pt-3"><span className="font-semibold">Total amount</span><span className="text-lg font-bold">SAR {checkout.amount.toFixed(2)}</span></div></div><TapCardForm amount={checkout.amount} currency={checkout.currency} shipmentId={checkout.shipmentId} submitLabel="Pay Now" pending={pay.isPending || confirm.isPending} onSubmit={(payload) => pay.mutate(payload)} /><div className="relative flex items-center py-1"><div className="flex-grow border-t" /><span className="px-3 text-xs uppercase text-muted-foreground">or</span><div className="flex-grow border-t" /></div>{creditAccess?.creditEnabled ? <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><Clock className="h-4 w-4" />Credit / Pay Later</p><p className="text-sm text-muted-foreground">Create your DDP shipment now and receive an invoice with 30-day payment terms.</p><Button variant="outline" className="w-full" onClick={() => credit.mutate()} disabled={credit.isPending}>Use Credit / Pay Later</Button></div> : <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">Credit / Pay Later is not enabled for your account. You can request access from your Billing page.</div>}</CardContent><CardFooter><Button variant="outline" onClick={() => goTo(8)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></CardFooter></Card>}

    {step === 10 && <Card><CardHeader className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900"><CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" /></div><CardTitle>DDP shipment submitted successfully!</CardTitle><CardDescription>Our team will review the booking and manage the shipment manually.</CardDescription></CardHeader><CardContent>{checkout && <div className="space-y-2 rounded-lg bg-muted p-4 text-sm"><div className="flex justify-between"><span>Shipment ID</span><span className="font-mono">{checkout.trackingNumber}</span></div><div className="flex justify-between"><span>Route</span><span>{routeLabel}</span></div><div className="flex justify-between"><span>Method</span><span>{transportMethod === "air" ? "Air freight" : "Sea freight"} · Door to Door</span></div></div>}</CardContent><CardFooter className="justify-center"><Button onClick={() => navigate("/client/shipments")}><House className="mr-2 h-4 w-4" />View all shipments</Button></CardFooter></Card>}
  </div></ClientLayout>;
}
