import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginData } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoadingSpinner } from "@/components/loading-spinner";
import { humanizeError } from "@/lib/friendly-error";
import { LogIn, UserPlus, Mail, KeyRound, ArrowLeft, Truck, Globe2, ShieldCheck, Zap } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, requestEmailOtp, verifyEmailOtp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Forgot-password dialog state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const submitForgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(forgotEmail.trim())) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setForgotBusy(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotSent(true);
    } catch (error) {
      toast({ title: "Could not send reset link", description: humanizeError(error), variant: "destructive" });
    } finally {
      setForgotBusy(false);
    }
  };

  // Email-OTP method state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  const sendOtp = async () => {
    if (!/^\S+@\S+\.\S+$/.test(otpEmail.trim())) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setOtpBusy(true);
    try {
      await requestEmailOtp(otpEmail.trim());
      setOtpSent(true);
      toast({ title: "Code sent", description: "Check your email for the 6-digit code." });
    } catch (error) {
      toast({ title: "Could not send code", description: humanizeError(error), variant: "destructive" });
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setOtpBusy(true);
    try {
      await verifyEmailOtp(otpEmail.trim(), otpCode.trim());
      toast({ title: "Welcome back!", description: "Signed in successfully." });
    } catch (error) {
      toast({ title: "Sign-in failed", description: humanizeError(error), variant: "destructive" });
    } finally {
      setOtpBusy(false);
    }
  };

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginData) => {
    setIsLoading(true);
    try {
      await login(data.username, data.password);
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const highlights = [
    { icon: Truck, title: "Local, Door-to-Door & Express", desc: "One platform for every shipping lane." },
    { icon: Globe2, title: "Real-time carrier tracking", desc: "FedEx, DHL, Aramex — synced live." },
    { icon: ShieldCheck, title: "Transparent pricing & invoicing", desc: "Quotes, VAT and credit, all in view." },
  ];

  return (
    <div className="relative min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.05fr_1fr] overflow-hidden">
      {/* ============ LEFT — brand showcase (desktop only) ============ */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white"
        style={{ background: "linear-gradient(140deg, #ff6a1f 0%, #fe5200 40%, #b83900 72%, #5f1e08 100%)" }}
      >
        {/* mesh glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-16 h-96 w-96 rounded-full bg-white/25 blur-[130px]" />
          <div className="absolute bottom-[-10%] right-[-8%] h-[30rem] w-[30rem] rounded-full blur-[140px]" style={{ background: "rgba(255,190,90,0.45)" }} />
          <div className="absolute top-1/2 left-1/4 h-72 w-72 rounded-full blur-[120px]" style={{ background: "rgba(210,40,10,0.5)" }} />
        </div>
        {/* fine grid + radial mask */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 25%, black, transparent 72%)",
            maskImage: "radial-gradient(ellipse at 30% 25%, black, transparent 72%)",
          }}
        />

        {/* brand mark */}
        <div className="relative animate-fade-up">
          <img src="/assets/branding/logo.png" alt="ezhalha" className="h-20 w-auto brightness-0 invert" />
        </div>

        {/* headline + value props */}
        <div className="relative max-w-lg animate-fade-up" style={{ animationDelay: "80ms" }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" /> Logistics, streamlined
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Ship smarter.<br />Move faster.
          </h2>
          <p className="mt-4 text-base text-white/80">
            The operations backbone for ezhalha — quote, book, track and invoice every shipment from one place.
          </p>

          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="flex items-start gap-4 animate-fade-up" style={{ animationDelay: `${160 + i * 80}ms` }}>
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold leading-tight">{title}</p>
                  <p className="text-sm text-white/70">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* trust footer */}
        <div className="relative flex items-center gap-6 text-sm text-white/70 animate-fade-up" style={{ animationDelay: "440ms" }}>
          <span>© {new Date().getFullYear()} ezhalha</span>
          <span className="h-1 w-1 rounded-full bg-white/40" />
          <a href="/policy/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
          <a href="/policy/shipping-return-policy" className="hover:text-white transition-colors">Shipping & Return</a>
        </div>
      </aside>

      {/* ============ RIGHT — auth column ============ */}
      <main className="relative flex min-h-screen flex-col">
        {/* subtle background for right side (mobile shows brand glow, desktop clean) */}
        <div className="pointer-events-none absolute inset-0 -z-10 lg:hidden">
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-[120px]" />
        </div>

        {/* top bar: mobile logo + theme toggle */}
        <header className="flex items-center justify-between p-4">
          <img src="/assets/branding/logo.png" alt="ezhalha" className="h-11 w-auto lg:hidden" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-4 pb-8">
          <div className="w-full max-w-md animate-fade-up">
            {/* heading */}
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to your ezhalha account to continue
              </p>
            </div>

            <Tabs defaultValue="otp" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="otp" data-testid="tab-otp"><Mail className="mr-1.5 h-3.5 w-3.5" />Email code</TabsTrigger>
                <TabsTrigger value="password" data-testid="tab-password"><KeyRound className="mr-1.5 h-3.5 w-3.5" />Password</TabsTrigger>
              </TabsList>

              {/* Method 1 & 2: email / username / phone + password */}
              <TabsContent value="password" className="mt-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email, username or phone</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="you@company.com, username, or +9665…"
                              autoComplete="username"
                              className="h-11"
                              data-testid="input-username"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your password"
                              autoComplete="current-password"
                              className="h-11"
                              data-testid="input-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end -mt-1">
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setForgotOpen(true)} data-testid="link-forgot-password">
                        Forgot password?
                      </button>
                    </div>

                    <Button type="submit" size="lg" className="w-full h-11 shadow-lg shadow-primary/20" disabled={isLoading} data-testid="button-login">
                      {isLoading ? <LoadingSpinner size="sm" className="mr-2" /> : <LogIn className="mr-2 h-4 w-4" />}
                      Sign In
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              {/* Method 3: email + one-time code */}
              <TabsContent value="otp" className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="h-11"
                    value={otpEmail}
                    disabled={otpSent}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    data-testid="input-otp-email"
                  />
                </div>

                {!otpSent ? (
                  <Button size="lg" className="w-full h-11 shadow-lg shadow-primary/20" disabled={otpBusy} onClick={sendOtp} data-testid="button-send-otp">
                    {otpBusy ? <LoadingSpinner size="sm" className="mr-2" /> : <Mail className="mr-2 h-4 w-4" />}
                    Send code
                  </Button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>6-digit code</Label>
                      <Input
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••••"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="h-12 text-center text-lg tracking-[0.5em]"
                        data-testid="input-otp-code"
                      />
                      <p className="text-xs text-muted-foreground">Sent to {otpEmail}. It expires in 10 minutes.</p>
                    </div>
                    <Button size="lg" className="w-full h-11 shadow-lg shadow-primary/20" disabled={otpBusy} onClick={verifyOtp} data-testid="button-verify-otp">
                      {otpBusy ? <LoadingSpinner size="sm" className="mr-2" /> : <LogIn className="mr-2 h-4 w-4" />}
                      Verify & sign in
                    </Button>
                    <div className="flex items-center justify-between text-xs">
                      <button type="button" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => { setOtpSent(false); setOtpCode(""); }}>
                        <ArrowLeft className="h-3 w-3" /> Change email
                      </button>
                      <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={otpBusy} onClick={sendOtp}>
                        Resend code
                      </button>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* apply divider */}
            <div className="mt-8 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Don't have an account?
                  </span>
                </div>
              </div>

              <Link href="/apply" className="block">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-11"
                  data-testid="button-apply"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Apply for an Account
                </Button>
              </Link>
            </div>

            {/* mobile-only footer links (left panel covers desktop) */}
            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground lg:hidden">
              <a href="/policy/privacy-policy" className="hover:underline" data-testid="link-privacy-policy">Privacy Policy</a>
              <span className="text-muted-foreground/50">|</span>
              <a href="/policy/shipping-return-policy" className="hover:underline" data-testid="link-shipping-policy">Shipping & Return Policy</a>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={forgotOpen} onOpenChange={(v) => { setForgotOpen(v); if (!v) { setForgotSent(false); setForgotEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your account email and we'll send you a link to set a new password.
            </DialogDescription>
          </DialogHeader>
          {forgotSent ? (
            <div className="py-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{forgotEmail}</span>, a reset link is on its way. Check your inbox (and spam). The link expires in 1 hour.
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <Label>Email address</Label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                data-testid="input-forgot-email"
              />
            </div>
          )}
          <DialogFooter>
            {forgotSent ? (
              <Button className="w-full" onClick={() => { setForgotOpen(false); setForgotSent(false); setForgotEmail(""); }}>Done</Button>
            ) : (
              <Button className="w-full" disabled={forgotBusy} onClick={submitForgot} data-testid="button-send-reset">
                {forgotBusy ? <LoadingSpinner size="sm" className="mr-2" /> : <Mail className="mr-2 h-4 w-4" />}
                Send reset link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
