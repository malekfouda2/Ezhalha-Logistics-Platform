import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, readJsonResponse } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, User, Mail, Calendar, Settings, KeyRound } from "lucide-react";

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordFormSchema>;

export default function AdminSettings() {
  const { user, checkAuth } = useAuth();
  const { toast } = useToast();

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

      return readJsonResponse(res);
    },
    onSuccess: async () => {
      passwordForm.reset();
      await checkAuth();
      toast({
        title: "Password Changed",
        description: "Your admin password has been updated successfully.",
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

  if (!user) {
    return (
      <AdminLayout>
        <div className="p-6">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {user.mustChangePassword && (
          <Alert variant="destructive" data-testid="alert-admin-must-change-password">
            <Shield className="h-4 w-4" />
            <AlertTitle>Password Change Required</AlertTitle>
            <AlertDescription>
              You must change your temporary password before using the rest of the admin panel. Update it below to finish your first login.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">
            Review your administrator account details and manage your sign-in security.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Overview
              </CardTitle>
              <CardDescription>
                Your administrator identity and access status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Username</span>
                <span className="text-sm font-medium">{user.username}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium flex items-center gap-2 text-right">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Account Status</span>
                <Badge variant={user.isActive ? "default" : "secondary"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Administrator Type</span>
                <span className="text-sm font-medium capitalize">{user.userType}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(user.createdAt), "MMM d, yyyy")}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Access Guidance
              </CardTitle>
              <CardDescription>
                Notes about your admin sign-in flow and security posture.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Password Status</span>
                  <Badge variant={user.mustChangePassword ? "destructive" : "outline"}>
                    {user.mustChangePassword ? "Action Required" : "Up to Date"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fresh admin accounts are created with a temporary password. Once you change it here, the forced-password-change flag is cleared automatically.
                </p>
              </div>
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4" />
                  Admin Access
                </div>
                <p className="text-sm text-muted-foreground">
                  Your visible pages and API access are controlled by the roles assigned to this admin user in the Access Control section.
                </p>
              </div>
              <div className="rounded-md border border-dashed p-4">
                <p className="text-sm text-muted-foreground">
                  Profile editing for admin identities can be expanded later, but password management and account visibility are fully functional now.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to secure this administrator account.
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
                              data-testid="input-admin-current-password"
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
                              data-testid="input-admin-new-password"
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
                              data-testid="input-admin-confirm-password"
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
                      data-testid="button-admin-change-password"
                    >
                      {changePasswordMutation.isPending ? (
                        <LoadingSpinner size="sm" className="mr-2" />
                      ) : (
                        <KeyRound className="mr-2 h-4 w-4" />
                      )}
                      Update Password
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
