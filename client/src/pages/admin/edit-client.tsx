import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Save, Building, User, MapPin, Globe } from "lucide-react";
import { insertClientAccountSchema, type ClientAccount, type PricingRule } from "@shared/schema";

const editClientSchema = insertClientAccountSchema.partial().extend({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  isActive: z.boolean(),
});

type EditClientFormData = z.infer<typeof editClientSchema>;

const countries = [
  "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "Jordan", "Lebanon", "United States", "United Kingdom", "Germany", "France", "Other",
];

export default function AdminEditClient() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/clients/:id/edit");
  const clientId = params?.id;

  const form = useForm<EditClientFormData>({
    resolver: zodResolver(editClientSchema),
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
      shippingContactName: "",
      shippingContactPhone: "",
      shippingCountryCode: "",
      shippingStateOrProvince: "",
      shippingCity: "",
      shippingPostalCode: "",
      shippingAddressLine1: "",
      shippingAddressLine2: "",
      shippingShortAddress: "",
      profile: "",
      isActive: true,
      nameAr: "",
      companyNameAr: "",
      nationalAddressStreetAr: "",
      nationalAddressBuildingAr: "",
      nationalAddressDistrictAr: "",
      nationalAddressCityAr: "",
    },
  });

  const { data: client, isLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/admin/clients", clientId],
    enabled: !!clientId,
  });

  const { data: pricingRules } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name || "",
        email: client.email || "",
        phone: client.phone || "",
        country: client.country || "",
        companyName: client.companyName || "",
        crNumber: client.crNumber || "",
        taxNumber: client.taxNumber || "",
        nationalAddressStreet: client.nationalAddressStreet || "",
        nationalAddressBuilding: client.nationalAddressBuilding || "",
        nationalAddressDistrict: client.nationalAddressDistrict || "",
        nationalAddressCity: client.nationalAddressCity || "",
        nationalAddressPostalCode: client.nationalAddressPostalCode || "",
        shippingContactName: client.shippingContactName || "",
        shippingContactPhone: client.shippingContactPhone || "",
        shippingCountryCode: client.shippingCountryCode || "",
        shippingStateOrProvince: client.shippingStateOrProvince || "",
        shippingCity: client.shippingCity || "",
        shippingPostalCode: client.shippingPostalCode || "",
        shippingAddressLine1: client.shippingAddressLine1 || "",
        shippingAddressLine2: client.shippingAddressLine2 || "",
        shippingShortAddress: client.shippingShortAddress || "",
        profile: client.profile || "",
        isActive: client.isActive,
        nameAr: client.nameAr || "",
        companyNameAr: client.companyNameAr || "",
        nationalAddressStreetAr: client.nationalAddressStreetAr || "",
        nationalAddressBuildingAr: client.nationalAddressBuildingAr || "",
        nationalAddressDistrictAr: client.nationalAddressDistrictAr || "",
        nationalAddressCityAr: client.nationalAddressCityAr || "",
      });
    }
  }, [client, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditClientFormData) => {
      await apiRequest("PATCH", `/api/admin/clients/${clientId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: "Client updated", description: "Client information has been updated successfully and synced to Zoho Books." });
      setLocation("/admin/clients");
    },
    onError: (error) => {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    },
  });

  const onSubmit = (data: EditClientFormData) => {
    updateMutation.mutate(data);
  };

  const uniqueProfiles = pricingRules
    ? Array.from(new Set(pricingRules.map((r) => r.profile)))
    : [];

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen />
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Client not found</p>
          <Button onClick={() => setLocation("/admin/clients")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clients
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/clients")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Edit Client</h1>
            <p className="text-muted-foreground">{client.accountNumber} - {client.name}</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs defaultValue="primary" className="space-y-6">
              <TabsList>
                <TabsTrigger value="primary" data-testid="tab-primary-language">
                  <Globe className="w-4 h-4 mr-2" />
                  Primary Language (English)
                </TabsTrigger>
                <TabsTrigger value="arabic" data-testid="tab-secondary-language">
                  <Globe className="w-4 h-4 mr-2" />
                  Secondary Language (Arabic)
                </TabsTrigger>
              </TabsList>

              <TabsContent value="primary" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>Contact and account details</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-name" />
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" disabled className="bg-muted" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-phone" />
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
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-country">
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {countries.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="profile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profile</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-profile">
                                <SelectValue placeholder="Select profile" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {uniqueProfiles.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value === "active")}
                            value={field.value ? "active" : "inactive"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-status">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      Company Information
                    </CardTitle>
                    <CardDescription>Business registration details</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-company-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="crNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CR Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-cr-number" />
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
                          <FormLabel>Tax Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-tax-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      National Address
                    </CardTitle>
                    <CardDescription>Saudi Arabia national address details</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="nationalAddressStreet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-national-street" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalAddressBuilding"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Building Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-national-building" />
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
                            <Input {...field} value={field.value || ""} data-testid="input-national-district" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalAddressCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-national-city" />
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
                            <Input {...field} value={field.value || ""} data-testid="input-national-postal" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Default Shipping Address
                    </CardTitle>
                    <CardDescription>Client's default shipping address for shipments</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="shippingContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-contact-name" />
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
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-contact-phone" />
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
                          <FormLabel>Country Code</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-country-code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingStateOrProvince"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State/Province</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-state" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-city" />
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
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-postal-code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingAddressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-address-1" />
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
                          <FormLabel>Address Line 2</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-address-2" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingShortAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Short Address (KSA)</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-shipping-short-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="arabic" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Basic Information (Arabic)
                    </CardTitle>
                    <CardDescription>Arabic language version of client information for Zoho Books</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="nameAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-name-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="companyNameAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-company-name-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      National Address (Arabic)
                    </CardTitle>
                    <CardDescription>Arabic language version of national address for Zoho Books</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="nationalAddressStreetAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-street-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalAddressBuildingAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Building Number (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-building-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalAddressDistrictAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>District (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-district-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalAddressCityAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City (Arabic)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" value={field.value || ""} data-testid="input-city-ar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Separator className="my-6" />

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/admin/clients")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AdminLayout>
  );
}
