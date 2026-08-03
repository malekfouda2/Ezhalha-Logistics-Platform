import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { humanizeError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoadingSpinner } from "@/components/loading-spinner";
import { CheckCircle2, KeyRound, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const token = new URLSearchParams(search).get("token") || "";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [mode, setMode] = useState<"reset" | "onboard">("reset");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setChecking(false); setValid(false); return; }
      try {
        const res = await fetch(`/api/auth/reset-password/${encodeURIComponent(token)}`, { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        setValid(Boolean(data?.valid));
        setMode(data?.mode === "onboard" ? "onboard" : "reset");
      } catch {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (password.length < 8) { toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" }); return; }
    if (password !== confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setDone(true);
      toast({ title: mode === "onboard" ? "Password set" : "Password updated", description: "You can now sign in." });
      setTimeout(() => navigate("/"), 1500);
    } catch (error) {
      toast({ title: "Could not save password", description: humanizeError(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-background overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-[120px]" />
      </div>
      <header className="flex items-center justify-between p-4">
        <img src="/assets/branding/logo.png" alt="ezhalha" className="h-14 w-auto" />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md animate-scale-in border-card-border/80 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <h1 className="text-2xl font-bold">{mode === "onboard" ? "Set your password" : "Reset password"}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === "onboard" ? "Choose a password to finish setting up your account." : "Choose a new password for your account."}
            </p>
          </CardHeader>

          <CardContent className="pt-4">
            {checking ? (
              <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>
            ) : done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="font-medium">All set — redirecting to sign in…</p>
              </div>
            ) : !valid ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">This link is invalid or has expired. Request a new one from the sign-in page.</p>
                <Link href="/"><Button variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to sign in</Button></Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>New password</Label>
                  <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" data-testid="input-new-password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm password</Label>
                  <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" data-testid="input-confirm-password" />
                </div>
                <Button className="w-full" disabled={busy} onClick={submit} data-testid="button-save-password">
                  {busy ? <LoadingSpinner size="sm" className="mr-2" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  {mode === "onboard" ? "Set password & continue" : "Update password"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
