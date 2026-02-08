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
import AdminPayments from "@/pages/admin/payments";
import AdminPricing from "@/pages/admin/pricing";
import AdminAuditLogs from "@/pages/admin/audit-logs";
import AdminIntegrationLogs from "@/pages/admin/integration-logs";
import AdminWebhookEvents from "@/pages/admin/webhook-events";
import AdminRBAC from "@/pages/admin/rbac";
import AdminEditClient from "@/pages/admin/edit-client";
import AdminPolicies from "@/pages/admin/policies";

// Client Pages
import ClientDashboard from "@/pages/client/dashboard";
import ClientShipments from "@/pages/client/shipments";
import CreateShipment from "@/pages/client/create-shipment";
import ClientInvoices from "@/pages/client/invoices";
import ClientPayments from "@/pages/client/payments";
import ClientSettings from "@/pages/client/settings";
import PolicyPage from "@/pages/policy";
import ClientUsers from "@/pages/client/users";

function ProtectedRoute({
  component: Component,
  requiredUserType,
  allowPasswordChange,
}: {
  component: () => JSX.Element;
  requiredUserType?: "admin" | "client";
  allowPasswordChange?: boolean;
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

  if (user.mustChangePassword && !allowPasswordChange) {
    return <Redirect to="/client/settings" />;
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
      <Route path="/policy/:slug" component={PolicyPage} />

      {/* Admin routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} requiredUserType="admin" />
      </Route>
      <Route path="/admin/clients">
        <ProtectedRoute component={AdminClients} requiredUserType="admin" />
      </Route>
      <Route path="/admin/clients/:id/edit">
        <ProtectedRoute component={AdminEditClient} requiredUserType="admin" />
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
      <Route path="/admin/payments">
        <ProtectedRoute component={AdminPayments} requiredUserType="admin" />
      </Route>
      <Route path="/admin/integration-logs">
        <ProtectedRoute component={AdminIntegrationLogs} requiredUserType="admin" />
      </Route>
      <Route path="/admin/webhook-events">
        <ProtectedRoute component={AdminWebhookEvents} requiredUserType="admin" />
      </Route>
      <Route path="/admin/rbac">
        <ProtectedRoute component={AdminRBAC} requiredUserType="admin" />
      </Route>
      <Route path="/admin/policies">
        <ProtectedRoute component={AdminPolicies} requiredUserType="admin" />
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
      <Route path="/client/settings">
        <ProtectedRoute component={ClientSettings} requiredUserType="client" allowPasswordChange />
      </Route>
      <Route path="/client/users">
        <ProtectedRoute component={ClientUsers} requiredUserType="client" />
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
