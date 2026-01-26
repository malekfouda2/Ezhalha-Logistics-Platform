import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applicationFormSchema, type ApplicationFormData } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useUpload } from "@/hooks/use-upload";
import { ArrowLeft, Send, CheckCircle, Upload, FileText, X, Building2, User } from "lucide-react";

const countries = [
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Jordan",
  "Lebanon",
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Other",
];

const shippingCountries = [
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
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "AT", name: "Austria" },
  { code: "PL", name: "Poland" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "FI", name: "Finland" },
  { code: "GR", name: "Greece" },
  { code: "CZ", name: "Czech Republic" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "TR", name: "Turkey" },
  { code: "IL", name: "Israel" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
];

interface UploadedDocument {
  name: string;
  path: string;
}

export default function ApplyPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      setUploadedDocs((prev) => [
        ...prev,
        { name: response.metadata.name, path: response.objectPath },
      ]);
      toast({
        title: "Document uploaded",
        description: response.metadata.name,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
    e.target.value = "";
  };

  const removeDocument = (path: string) => {
    setUploadedDocs((prev) => prev.filter((doc) => doc.path !== path));
  };

  const form = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: {
      accountType: "company",
      name: "",
      email: "",
      phone: "",
      country: "",
      companyName: "",
      shippingContactName: "",
      shippingContactPhone: "",
      shippingCountryCode: "",
      shippingCity: "",
      shippingPostalCode: "",
      shippingAddressLine1: "",
      shippingAddressLine2: "",
      shippingShortAddress: "",
    },
  });

  const shippingCountryCode = form.watch("shippingCountryCode");

  const accountType = form.watch("accountType");

  const onSubmit = async (data: ApplicationFormData) => {
    if (accountType === "company" && uploadedDocs.length === 0) {
      toast({
        title: "Documents required",
        description: "Please upload at least one company document",
        variant: "destructive",
      });
      return;
    }
    
    // Validate short address for SA
    if (data.shippingCountryCode === "SA" && !data.shippingShortAddress) {
      toast({
        title: "Short address required",
        description: "Short address is required for Saudi Arabia addresses",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const applicationData = {
        ...data,
        documents: uploadedDocs.map((doc) => doc.path),
      };
      await apiRequest("POST", "/api/applications", applicationData);
      setIsSubmitted(true);
      toast({
        title: "Application submitted!",
        description: "We'll review your application and get back to you soon.",
      });
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between p-4">
          <img
            src="/assets/branding/logo.png"
            alt="ezhalha"
            className="h-10 w-auto"
          />
          <ThemeToggle />
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center">
            <CardContent className="pt-8 pb-8">
              <div className="flex justify-center mb-6">
                <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">Application Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for your interest in ezhalha. Our team will review your
                application and contact you via email within 1-2 business days.
              </p>
              <Link href="/">
                <Button variant="outline" data-testid="button-back-login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between p-4">
        <img
          src="/assets/branding/logo.png"
          alt="ezhalha"
          className="h-10 w-auto"
        />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-2">
            <h1 className="text-2xl font-bold">Apply for an Account</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Fill out the form below to request access to ezhalha
            </p>
          </CardHeader>

          <CardContent className="pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Account Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="grid grid-cols-2 gap-4"
                          data-testid="radio-account-type"
                        >
                          <div>
                            <RadioGroupItem
                              value="company"
                              id="company"
                              className="peer sr-only"
                            />
                            <Label
                              htmlFor="company"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                              data-testid="label-account-company"
                            >
                              <Building2 className="mb-3 h-6 w-6" />
                              <span className="text-sm font-medium">Company</span>
                              <span className="text-xs text-muted-foreground">Business account</span>
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem
                              value="individual"
                              id="individual"
                              className="peer sr-only"
                            />
                            <Label
                              htmlFor="individual"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                              data-testid="label-account-individual"
                            >
                              <User className="mb-3 h-6 w-6" />
                              <span className="text-sm font-medium">Individual</span>
                              <span className="text-xs text-muted-foreground">Personal account</span>
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          data-testid="input-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@company.com"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+1 234 567 890"
                            data-testid="input-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {countries.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {accountType === "company" && (
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your company name"
                            data-testid="input-company"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Default Shipping Address Section */}
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-1">Default Shipping Address</h3>
                  <FormDescription className="mb-4">
                    This address will be used as the default for your shipments. For inbound shipments, it will be the recipient address. For outbound shipments, it will be the sender address.
                  </FormDescription>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="shippingContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Contact person name"
                                data-testid="input-shipping-contact-name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shippingContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="+966 5XX XXX XXXX"
                                data-testid="input-shipping-contact-phone"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="shippingAddressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Street address, building number"
                              data-testid="input-shipping-address1"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="shippingAddressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2 (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Suite, unit, floor, etc."
                              data-testid="input-shipping-address2"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="shippingCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="City"
                                data-testid="input-shipping-city"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shippingPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Postal/ZIP code"
                                data-testid="input-shipping-postal"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shippingCountryCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-shipping-country">
                                  <SelectValue placeholder="Select country" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {shippingCountries.map((c) => (
                                  <SelectItem key={c.code} value={c.code}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {shippingCountryCode === "SA" && (
                      <FormField
                        control={form.control}
                        name="shippingShortAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Short Address</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. RCTB4359"
                                data-testid="input-shipping-short-address"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Required for Saudi Arabia addresses (e.g. RCTB4359)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>

                {accountType === "company" && (
                  <div className="pt-4 border-t">
                    <h3 className="text-sm font-medium mb-3">
                      Upload Company Documents
                    </h3>
                    <FormDescription className="mb-3">
                      Please upload your Commercial Registration, Tax Certificate, and any other required business documents.
                    </FormDescription>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label htmlFor="document-upload" className="cursor-pointer">
                          <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted/50 transition-colors">
                            <Upload className="h-4 w-4" />
                            <span className="text-sm">
                              {isUploading ? "Uploading..." : "Choose Files"}
                            </span>
                          </div>
                          <input
                            id="document-upload"
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={handleFileSelect}
                            disabled={isUploading}
                            data-testid="input-documents"
                          />
                        </label>
                        <span className="text-xs text-muted-foreground">
                          PDF, DOC, DOCX, JPG, PNG (max 10MB each)
                        </span>
                      </div>
                      
                      {uploadedDocs.length > 0 && (
                        <div className="space-y-2">
                          {uploadedDocs.map((doc) => (
                            <div
                              key={doc.path}
                              className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                <span className="text-sm truncate">{doc.name}</span>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeDocument(doc.path)}
                                data-testid={`button-remove-doc-${doc.name}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <CardFooter className="flex flex-col gap-4 px-0 pt-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || isUploading}
                    data-testid="button-submit"
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner className="mr-2" size="sm" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Application
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/" className="text-primary hover:underline">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
