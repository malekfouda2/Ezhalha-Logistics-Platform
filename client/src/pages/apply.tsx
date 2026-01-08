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
import { ArrowLeft, Send, CheckCircle, Upload, FileText, X } from "lucide-react";

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
      name: "",
      email: "",
      phone: "",
      country: "",
      companyName: "",
      crNumber: "",
      taxNumber: "",
      nationalAddressStreet: "",
      nationalAddressBuilding: "",
      nationalAddressDistrict: "",
      nationalAddressCity: "",
      nationalAddressPostalCode: "",
    },
  });

  const onSubmit = async (data: ApplicationFormData) => {
    if (uploadedDocs.length === 0) {
      toast({
        title: "Documents required",
        description: "Please upload at least one company document",
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
      {/* Header */}
      <header className="flex items-center justify-between p-4">
        <img
          src="/assets/branding/logo.png"
          alt="ezhalha"
          className="h-10 w-auto"
        />
        <ThemeToggle />
      </header>

      {/* Main Content */}
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

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Company Documents</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="crNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Commercial Registration (CR) Number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 1010123456"
                                data-testid="input-cr-number"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="taxNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Number (VAT)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 300012345678903"
                                data-testid="input-tax-number"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">National Address</h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="nationalAddressStreet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., King Fahd Road"
                              data-testid="input-address-street"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="nationalAddressBuilding"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Building Number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 1234"
                                data-testid="input-address-building"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="nationalAddressDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Al Olaya"
                                data-testid="input-address-district"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="nationalAddressCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Riyadh"
                                data-testid="input-address-city"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="nationalAddressPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 12345"
                                data-testid="input-address-postal"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Upload Company Documents</h3>
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
                              data-testid={`button-remove-doc-${doc.path}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {uploadedDocs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No documents uploaded yet
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || isUploading}
                  data-testid="button-submit"
                >
                  {isLoading ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit Application
                </Button>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="justify-center pt-2">
            <Link href="/">
              <Button variant="ghost" data-testid="link-back-login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>ezhalha Logistics Platform</p>
      </footer>
    </div>
  );
}
