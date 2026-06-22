import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, readJsonResponse } from "@/lib/queryClient";
import { KeyRound } from "lucide-react";

interface AcceptInvitePageProps {
  params: {
    token: string;
  };
}

interface InvitationPreview {
  id: string;
  fullName: string;
  email: string;
  personalMessage?: string | null;
  department: {
    id: string;
    name: string;
    slug: string;
  } | null;
  role: {
    id: string;
    name: string;
    hierarchyLevel: string | null;
  } | null;
  expiresAt: string;
}

export default function AcceptInvitePage({ params }: AcceptInvitePageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const invitationQuery = useQuery<InvitationPreview>({
    queryKey: ["/api/public/invitations", params.token],
    queryFn: async () => {
      const res = await fetch(`/api/public/invitations/${params.token}`);
      if (!res.ok) {
        throw new Error("Invitation is no longer valid");
      }
      return readJsonResponse<InvitationPreview>(res);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await apiRequest("POST", `/api/public/invitations/${params.token}/accept`, { password });
      return readJsonResponse<{ success: boolean }>(res);
    },
    onSuccess: () => {
      toast({
        title: "Account ready",
        description: "Your password has been set. Sign in to continue.",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Could not accept invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (invitationQuery.isLoading) {
    return <LoadingScreen message="Loading invitation..." />;
  }

  if (invitationQuery.isError || !invitationQuery.data) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between p-4">
          <img src="/assets/branding/logo.png" alt="ezhalha" className="h-10 w-auto" />
          <ThemeToggle />
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
              <p className="text-sm text-muted-foreground">This invite is invalid, expired, or already used.</p>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const invitation = invitationQuery.data;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between p-4">
        <img src="/assets/branding/logo.png" alt="ezhalha" className="h-10 w-auto" />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="space-y-2">
            <h1 className="text-2xl font-semibold">Set your password</h1>
            <p className="text-sm text-muted-foreground">
              {invitation.fullName} invited to {invitation.department?.name || "ezhalha"} as {invitation.role?.name || "staff"}.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/35 p-4 text-sm">
              <div className="font-medium">{invitation.email}</div>
              {invitation.personalMessage ? (
                <p className="mt-2 text-muted-foreground">{invitation.personalMessage}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-confirm-password">Confirm password</Label>
              <Input
                id="invite-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
              />
            </div>

            <Button
              className="w-full"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Complete setup
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
