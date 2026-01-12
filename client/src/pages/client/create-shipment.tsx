import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Package, MapPin, Truck, Check, CreditCard, Clock, DollarSign } from "lucide-react";
import { Link } from "wouter";
import type { ClientAccount } from "@shared/schema";
import { format } from "date-fns";

interface ShipmentFormData {
  shipper: {
    name: string;
    phone: string;
    countryCode: string;
    city: string;
    postalCode: string;
    addressLine1: string;
    addressLine2?: string;
    stateOrProvince?: string;
  };
  recipient: {
    name: string;
    phone: string;
    countryCode: string;
    city: string;
    postalCode: string;
    addressLine1: string;
    addressLine2?: string;
    stateOrProvince?: string;
  };
  package: {
    weight: number;
    weightUnit: "LB" | "KG";
    length: number;
    width: number;
    height: number;
    dimensionUnit: "IN" | "CM";
    packageType: string;
  };
  shipmentType: "domestic" | "international";
  currency: string;
}

interface RateQuote {
  quoteId: string;
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

interface CheckoutResponse {
  shipmentId: string;
  trackingNumber: string;
  paymentIntentId?: string;
  clientSecret?: string;
  amount: number;
  currency: string;
}

interface ConfirmResponse {
  shipment: any;
  carrierTrackingNumber: string;
  labelUrl?: string;
  estimatedDelivery?: string;
}

const countries = [
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "EG", name: "Egypt" },
  { code: "JO", name: "Jordan" },
  { code: "LB", name: "Lebanon" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
];

const packageTypes = [
  { value: "YOUR_PACKAGING", label: "Your Packaging" },
  { value: "FEDEX_ENVELOPE", label: "FedEx Envelope" },
  { value: "FEDEX_PAK", label: "FedEx Pak" },
  { value: "FEDEX_BOX", label: "FedEx Box" },
  { value: "FEDEX_TUBE", label: "FedEx Tube" },
];

export default function CreateShipment() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmResponse | null>(null);

  const [formData, setFormData] = useState<ShipmentFormData>({
    shipper: {
      name: "",
      phone: "",
      countryCode: "US",
      city: "",
      postalCode: "",
      addressLine1: "",
      addressLine2: "",
      stateOrProvince: "",
    },
    recipient: {
      name: "",
      phone: "",
      countryCode: "US",
      city: "",
      postalCode: "",
      addressLine1: "",
      addressLine2: "",
      stateOrProvince: "",
    },
    package: {
      weight: 1,
      weightUnit: "LB",
      length: 10,
      width: 10,
      height: 10,
      dimensionUnit: "IN",
      packageType: "YOUR_PACKAGING",
    },
    shipmentType: "domestic",
    currency: "USD",
  });

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const getRatesMutation = useMutation({
    mutationFn: async (data: ShipmentFormData) => {
      const res = await apiRequest("POST", "/api/client/shipments/rates", data);
      return res.json() as Promise<RatesResponse>;
    },
    onSuccess: (data) => {
      setRates(data);
      setStep(4);
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
    mutationFn: async (quoteId: string) => {
      const res = await apiRequest("POST", "/api/client/shipments/checkout", { quoteId });
      return res.json() as Promise<CheckoutResponse>;
    },
    onSuccess: (data) => {
      setCheckoutData(data);
      setStep(5);
    },
    onError: (error) => {
      toast({
        title: "Failed to process checkout",
        description: error instanceof Error ? error.message : "Please try again",
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
      setStep(6);
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to confirm shipment",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

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

  const updatePackage = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      package: { ...prev.package, [field]: value },
    }));
  };

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      const { name, phone, countryCode, city, postalCode, addressLine1 } = formData.shipper;
      if (!name || !phone || !countryCode || !city || !postalCode || !addressLine1) {
        toast({ title: "Please fill in all required shipper fields", variant: "destructive" });
        return false;
      }
    } else if (currentStep === 2) {
      const { name, phone, countryCode, city, postalCode, addressLine1 } = formData.recipient;
      if (!name || !phone || !countryCode || !city || !postalCode || !addressLine1) {
        toast({ title: "Please fill in all required recipient fields", variant: "destructive" });
        return false;
      }
    } else if (currentStep === 3) {
      const { weight, length, width, height, packageType } = formData.package;
      if (!weight || !length || !width || !height || !packageType) {
        toast({ title: "Please fill in all package details", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      if (step === 3) {
        formData.shipmentType = formData.shipper.countryCode === formData.recipient.countryCode ? "domestic" : "international";
        getRatesMutation.mutate(formData);
      } else {
        setStep(step + 1);
      }
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSelectRate = () => {
    if (selectedQuoteId) {
      checkoutMutation.mutate(selectedQuoteId);
    }
  };

  const handleConfirmPayment = () => {
    if (checkoutData) {
      confirmMutation.mutate({
        shipmentId: checkoutData.shipmentId,
        paymentIntentId: checkoutData.paymentIntentId,
      });
    }
  };

  const stepTitles = [
    "Sender Details",
    "Recipient Details",
    "Package Details",
    "Select Rate",
    "Payment",
    "Confirmation",
  ];

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
          {[1, 2, 3, 4, 5, 6].map((s) => (
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
              {s < 6 && (
                <div className={`w-8 h-1 mx-1 ${step > s ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-muted-foreground mb-6">{stepTitles[step - 1]}</p>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Sender Details
              </CardTitle>
              <CardDescription>Enter the pickup address and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Label>State/Province</Label>
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
                  <Label>Postal Code *</Label>
                  <Input
                    value={formData.shipper.postalCode}
                    onChange={(e) => updateShipper("postalCode", e.target.value)}
                    placeholder="Postal code"
                    data-testid="input-shipper-postal"
                  />
                </div>
                <div>
                  <Label>Country *</Label>
                  <Select
                    value={formData.shipper.countryCode}
                    onValueChange={(v) => updateShipper("countryCode", v)}
                  >
                    <SelectTrigger data-testid="select-shipper-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  value={formData.shipper.phone}
                  onChange={(e) => updateShipper("phone", e.target.value)}
                  placeholder="+1 234 567 890"
                  data-testid="input-shipper-phone"
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={nextStep} data-testid="button-next">Next: Recipient Details</Button>
            </CardFooter>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Recipient Details
              </CardTitle>
              <CardDescription>Enter the delivery address and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Label>State/Province</Label>
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
                  <Label>Postal Code *</Label>
                  <Input
                    value={formData.recipient.postalCode}
                    onChange={(e) => updateRecipient("postalCode", e.target.value)}
                    placeholder="Postal code"
                    data-testid="input-recipient-postal"
                  />
                </div>
                <div>
                  <Label>Country *</Label>
                  <Select
                    value={formData.recipient.countryCode}
                    onValueChange={(v) => updateRecipient("countryCode", v)}
                  >
                    <SelectTrigger data-testid="select-recipient-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  value={formData.recipient.phone}
                  onChange={(e) => updateRecipient("phone", e.target.value)}
                  placeholder="+1 234 567 890"
                  data-testid="input-recipient-phone"
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={prevStep} data-testid="button-prev">Back</Button>
              <Button onClick={nextStep} data-testid="button-next">Next: Package Details</Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Package Details
              </CardTitle>
              <CardDescription>Describe your package to get accurate rates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Package Type</Label>
                <Select
                  value={formData.package.packageType}
                  onValueChange={(v) => updatePackage("packageType", v)}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Weight *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.package.weight}
                    onChange={(e) => updatePackage("weight", parseFloat(e.target.value) || 0)}
                    data-testid="input-weight"
                  />
                </div>
                <div>
                  <Label>Weight Unit</Label>
                  <Select
                    value={formData.package.weightUnit}
                    onValueChange={(v) => updatePackage("weightUnit", v)}
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
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Length *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.package.length}
                    onChange={(e) => updatePackage("length", parseFloat(e.target.value) || 0)}
                    data-testid="input-length"
                  />
                </div>
                <div>
                  <Label>Width *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.package.width}
                    onChange={(e) => updatePackage("width", parseFloat(e.target.value) || 0)}
                    data-testid="input-width"
                  />
                </div>
                <div>
                  <Label>Height *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.package.height}
                    onChange={(e) => updatePackage("height", parseFloat(e.target.value) || 0)}
                    data-testid="input-height"
                  />
                </div>
              </div>
              <div>
                <Label>Dimension Unit</Label>
                <Select
                  value={formData.package.dimensionUnit}
                  onValueChange={(v) => updatePackage("dimensionUnit", v)}
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
            </CardContent>
            <CardFooter className="flex justify-between">
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

        {step === 4 && rates && (
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
              <RadioGroup value={selectedQuoteId || ""} onValueChange={setSelectedQuoteId}>
                <div className="space-y-3">
                  {rates.quotes.map((quote) => (
                    <div
                      key={quote.quoteId}
                      className={`flex items-center space-x-4 p-4 rounded-lg border cursor-pointer hover-elevate ${
                        selectedQuoteId === quote.quoteId ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      onClick={() => setSelectedQuoteId(quote.quoteId)}
                      data-testid={`rate-option-${quote.serviceType}`}
                    >
                      <RadioGroupItem value={quote.quoteId} id={quote.quoteId} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{quote.serviceName}</p>
                            <p className="text-sm text-muted-foreground">{quote.carrierName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">${quote.finalPrice.toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">{quote.currency}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {quote.transitDays} day{quote.transitDays !== 1 ? "s" : ""}
                          </span>
                          {quote.estimatedDelivery && (
                            <span>Est. delivery: {format(new Date(quote.estimatedDelivery), "MMM d")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="button-prev">Back</Button>
              <Button
                onClick={handleSelectRate}
                disabled={!selectedQuoteId || checkoutMutation.isPending}
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

        {step === 5 && checkoutData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Confirm Payment
              </CardTitle>
              <CardDescription>Review and confirm your shipment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Order Summary</h4>
                <div className="flex justify-between text-sm">
                  <span>Tracking Number</span>
                  <span className="font-mono">{checkoutData.trackingNumber}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span>Total Amount</span>
                  <span className="font-bold text-lg">
                    ${checkoutData.amount.toFixed(2)} {checkoutData.currency}
                  </span>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <DollarSign className="h-4 w-4" />
                  Payment will be processed securely
                </div>
                <p className="text-xs text-muted-foreground">
                  {checkoutData.paymentIntentId
                    ? "Your payment will be processed via Stripe."
                    : "Demo mode: Payment will be simulated."}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)} data-testid="button-prev">Back</Button>
              <Button
                onClick={handleConfirmPayment}
                disabled={confirmMutation.isPending}
                data-testid="button-confirm"
              >
                {confirmMutation.isPending ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Confirming...</>
                ) : (
                  <>Confirm & Create Shipment</>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 6 && confirmData && (
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
                  <span>Internal Tracking</span>
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
    </ClientLayout>
  );
}
