import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClientLayout } from "@/components/client-layout";
import { ProfileBadge } from "@/components/profile-badge";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Building, Mail, Phone, MapPin, Shield, Calendar, Save, Lock, KeyRound } from "lucide-react";
import type { ClientAccount } from "@shared/schema";
import { format } from "date-fns";

const profileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone is required"),
  companyName: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordFormSchema>;

export default function ClientSettings() {
  const { toast } = useToast();

  const { data: account, isLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      companyName: "",
    },
    values: account
      ? {
          name: account.name,
          email: account.email,
          phone: account.phone,
          companyName: account.companyName || "",
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("PATCH", "/api/client/account", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/account"] });
      toast({
        title: "Profile Updated",
        description: "Your account details have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onPasswordSubmit = (data: PasswordFormData) => {
    changePasswordMutation.mutate(data);
  };

  const profileBenefits: Record<string, string[]> = {
    regular: ["Standard shipping rates", "Email support"],
    mid_level: ["15% discount on all shipments", "Priority email support", "Monthly reports"],
    vip: ["25% discount on all shipments", "24/7 phone support", "Dedicated account manager", "Custom reporting"],
  };

  if (isLoading) {
    return (
      <ClientLayout>
        <LoadingScreen message="Loading settings..." />
      </ClientLayout>
    );
  }


  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account details and preferences
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile Information Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your contact details and company information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Your name"
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
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Your company"
                              data-testid="input-company"
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
                              placeholder="your@email.com"
                              data-testid="input-email"
                              {...field}
                            />
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
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+1 234 567 8900"
                              data-testid="input-phone"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      data-testid="button-save"
                    >
                      {updateMutation.isPending ? (
                        <LoadingSpinner size="sm" className="mr-2" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Account Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Account Status</span>
                <span className={`text-sm font-medium ${account?.isActive ? "text-green-600" : "text-red-600"}`}>
                  {account?.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Country</span>
                <span className="text-sm font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {account?.country || "Not set"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {account?.createdAt
                    ? format(new Date(account.createdAt), "MMM d, yyyy")
                    : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Tier Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Pricing Tier
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Tier</span>
                <ProfileBadge profile={account?.profile || "regular"} />
              </div>
              <Separator />
              <div>
                <span className="text-sm font-medium">Your Benefits:</span>
                <ul className="mt-2 space-y-1">
                  {(profileBenefits[account?.profile as keyof typeof profileBenefits] || profileBenefits.regular).map(
                    (benefit, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {benefit}
                      </li>
                    )
                  )}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Contact your account manager to upgrade your tier.
              </p>
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter current password"
                              data-testid="input-current-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter new password"
                              data-testid="input-new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>At least 8 characters</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm new password"
                              data-testid="input-confirm-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-change-password"
                    >
                      {changePasswordMutation.isPending ? (
                        <LoadingSpinner size="sm" className="mr-2" />
                      ) : (
                        <KeyRound className="mr-2 h-4 w-4" />
                      )}
                      Change Password
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}
