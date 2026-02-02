import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Save, Building, User, MapPin, Globe } from "lucide-react";
import type { ClientAccount, PricingRule } from "@shared/schema";

const countries = [
  "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "Jordan", "Lebanon", "United States", "United Kingdom", "Germany", "France", "Other",
];

export default function AdminEditClient() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/clients/:id/edit");
  const clientId = params?.id;

  const [formData, setFormData] = useState({
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
    profile: "",
    isActive: true,
    nameAr: "",
    companyNameAr: "",
    nationalAddressStreetAr: "",
    nationalAddressBuildingAr: "",
    nationalAddressDistrictAr: "",
    nationalAddressCityAr: "",
  });

  const { data: client, isLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/admin/clients", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: pricingRules } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  useEffect(() => {
    if (client) {
      setFormData({
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
        profile: client.profile || "",
        isActive: client.isActive,
        nameAr: (client as any).nameAr || "",
        companyNameAr: (client as any).companyNameAr || "",
        nationalAddressStreetAr: (client as any).nationalAddressStreetAr || "",
        nationalAddressBuildingAr: (client as any).nationalAddressBuildingAr || "",
        nationalAddressDistrictAr: (client as any).nationalAddressDistrictAr || "",
        nationalAddressCityAr: (client as any).nationalAddressCityAr || "",
      });
    }
  }, [client]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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

        <form onSubmit={handleSubmit}>
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
                  <div className="space-y-2">
                    <Label htmlFor="name">Contact Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="bg-muted"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="input-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={formData.country}
                      onValueChange={(value) => setFormData({ ...formData, country: value })}
                    >
                      <SelectTrigger data-testid="select-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile">Profile</Label>
                    <Select
                      value={formData.profile}
                      onValueChange={(value) => setFormData({ ...formData, profile: value })}
                    >
                      <SelectTrigger data-testid="select-profile">
                        <SelectValue placeholder="Select profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueProfiles.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="isActive">Status</Label>
                    <Select
                      value={formData.isActive ? "active" : "inactive"}
                      onValueChange={(value) => setFormData({ ...formData, isActive: value === "active" })}
                    >
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      data-testid="input-company-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crNumber">CR Number</Label>
                    <Input
                      id="crNumber"
                      value={formData.crNumber}
                      onChange={(e) => setFormData({ ...formData, crNumber: e.target.value })}
                      data-testid="input-cr-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxNumber">Tax Number</Label>
                    <Input
                      id="taxNumber"
                      value={formData.taxNumber}
                      onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                      data-testid="input-tax-number"
                    />
                  </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressStreet">Street</Label>
                    <Input
                      id="nationalAddressStreet"
                      value={formData.nationalAddressStreet}
                      onChange={(e) => setFormData({ ...formData, nationalAddressStreet: e.target.value })}
                      data-testid="input-national-street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressBuilding">Building Number</Label>
                    <Input
                      id="nationalAddressBuilding"
                      value={formData.nationalAddressBuilding}
                      onChange={(e) => setFormData({ ...formData, nationalAddressBuilding: e.target.value })}
                      data-testid="input-national-building"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressDistrict">District</Label>
                    <Input
                      id="nationalAddressDistrict"
                      value={formData.nationalAddressDistrict}
                      onChange={(e) => setFormData({ ...formData, nationalAddressDistrict: e.target.value })}
                      data-testid="input-national-district"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressCity">City</Label>
                    <Input
                      id="nationalAddressCity"
                      value={formData.nationalAddressCity}
                      onChange={(e) => setFormData({ ...formData, nationalAddressCity: e.target.value })}
                      data-testid="input-national-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressPostalCode">Postal Code</Label>
                    <Input
                      id="nationalAddressPostalCode"
                      value={formData.nationalAddressPostalCode}
                      onChange={(e) => setFormData({ ...formData, nationalAddressPostalCode: e.target.value })}
                      data-testid="input-national-postal"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="arabic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    معلومات أساسية (Basic Information)
                  </CardTitle>
                  <CardDescription>Arabic language version of client information for Zoho Books</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nameAr">الاسم (Name in Arabic)</Label>
                    <Input
                      id="nameAr"
                      dir="rtl"
                      value={formData.nameAr}
                      onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                      placeholder="أدخل الاسم بالعربية"
                      data-testid="input-name-ar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyNameAr">اسم الشركة (Company Name in Arabic)</Label>
                    <Input
                      id="companyNameAr"
                      dir="rtl"
                      value={formData.companyNameAr}
                      onChange={(e) => setFormData({ ...formData, companyNameAr: e.target.value })}
                      placeholder="أدخل اسم الشركة بالعربية"
                      data-testid="input-company-name-ar"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    العنوان الوطني (National Address)
                  </CardTitle>
                  <CardDescription>Arabic language version of national address for Zoho Books</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressStreetAr">الشارع (Street in Arabic)</Label>
                    <Input
                      id="nationalAddressStreetAr"
                      dir="rtl"
                      value={formData.nationalAddressStreetAr}
                      onChange={(e) => setFormData({ ...formData, nationalAddressStreetAr: e.target.value })}
                      placeholder="أدخل اسم الشارع بالعربية"
                      data-testid="input-street-ar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressBuildingAr">رقم المبنى (Building Number in Arabic)</Label>
                    <Input
                      id="nationalAddressBuildingAr"
                      dir="rtl"
                      value={formData.nationalAddressBuildingAr}
                      onChange={(e) => setFormData({ ...formData, nationalAddressBuildingAr: e.target.value })}
                      placeholder="أدخل رقم المبنى بالعربية"
                      data-testid="input-building-ar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressDistrictAr">الحي (District in Arabic)</Label>
                    <Input
                      id="nationalAddressDistrictAr"
                      dir="rtl"
                      value={formData.nationalAddressDistrictAr}
                      onChange={(e) => setFormData({ ...formData, nationalAddressDistrictAr: e.target.value })}
                      placeholder="أدخل اسم الحي بالعربية"
                      data-testid="input-district-ar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalAddressCityAr">المدينة (City in Arabic)</Label>
                    <Input
                      id="nationalAddressCityAr"
                      dir="rtl"
                      value={formData.nationalAddressCityAr}
                      onChange={(e) => setFormData({ ...formData, nationalAddressCityAr: e.target.value })}
                      placeholder="أدخل اسم المدينة بالعربية"
                      data-testid="input-city-ar"
                    />
                  </div>
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
      </div>
    </AdminLayout>
  );
}
