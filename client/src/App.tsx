import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoadingScreen } from "@/components/loading-spinner";

// Pages
import LoginPage from "@/pages/login";
import ApplyPage from "@/pages/apply";
import NotFound from "@/pages/not-found";

// Admin Pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminClients from "@/pages/admin/clients";
import AdminApplications from "@/pages/admin/applications";
import AdminShipments from "@/pages/admin/shipments";
import AdminInvoices from "@/pages/admin/invoices";
import AdminPricing from "@/pages/admin/pricing";
import AdminAuditLogs from "@/pages/admin/audit-logs";

// Client Pages
import ClientDashboard from "@/pages/client/dashboard";
import ClientShipments from "@/pages/client/shipments";
import CreateShipment from "@/pages/client/create-shipment";
import ClientInvoices from "@/pages/client/invoices";
import ClientPayments from "@/pages/client/payments";

function ProtectedRoute({
  component: Component,
  requiredUserType,
}: {
  component: () => JSX.Element;
  requiredUserType?: "admin" | "client";
}) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (requiredUserType && user.userType !== requiredUserType) {
    const redirectPath = user.userType === "admin" ? "/admin" : "/client";
    return <Redirect to={redirectPath} />;
  }

  return <Component />;
}

function AuthRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (user) {
    const redirectPath = user.userType === "admin" ? "/admin" : "/client";
    return <Redirect to={redirectPath} />;
  }

  return <LoginPage />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={AuthRedirect} />
      <Route path="/apply" component={ApplyPage} />

      {/* Admin routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} requiredUserType="admin" />
      </Route>
      <Route path="/admin/clients">
        <ProtectedRoute component={AdminClients} requiredUserType="admin" />
      </Route>
      <Route path="/admin/applications">
        <ProtectedRoute component={AdminApplications} requiredUserType="admin" />
      </Route>
      <Route path="/admin/shipments">
        <ProtectedRoute component={AdminShipments} requiredUserType="admin" />
      </Route>
      <Route path="/admin/invoices">
        <ProtectedRoute component={AdminInvoices} requiredUserType="admin" />
      </Route>
      <Route path="/admin/pricing">
        <ProtectedRoute component={AdminPricing} requiredUserType="admin" />
      </Route>
      <Route path="/admin/audit-logs">
        <ProtectedRoute component={AdminAuditLogs} requiredUserType="admin" />
      </Route>

      {/* Client routes */}
      <Route path="/client">
        <ProtectedRoute component={ClientDashboard} requiredUserType="client" />
      </Route>
      <Route path="/client/shipments">
        <ProtectedRoute component={ClientShipments} requiredUserType="client" />
      </Route>
      <Route path="/client/shipments/new">
        <ProtectedRoute component={CreateShipment} requiredUserType="client" />
      </Route>
      <Route path="/client/invoices">
        <ProtectedRoute component={ClientInvoices} requiredUserType="client" />
      </Route>
      <Route path="/client/payments">
        <ProtectedRoute component={ClientPayments} requiredUserType="client" />
      </Route>

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
