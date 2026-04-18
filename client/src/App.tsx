import { Switch, Route, Redirect } from "wouter";
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
import AdminAccountManagers from "@/pages/admin/account-managers";
import AdminEditClient from "@/pages/admin/edit-client";
import AdminPolicies from "@/pages/admin/policies";
import AdminCreditInvoices from "@/pages/admin/credit-invoices";
import AdminCreditRequests from "@/pages/admin/credit-requests";
import AdminEmailTemplates from "@/pages/admin/email-templates";
import AdminSystemLogs from "@/pages/admin/system-logs";
import AdminSettings from "@/pages/admin/settings";

// Client Pages
import ClientDashboard from "@/pages/client/dashboard";
import ClientShipments from "@/pages/client/shipments";
import CreateShipment from "@/pages/client/create-shipment";
import ClientInvoices from "@/pages/client/invoices";
import ClientPayments from "@/pages/client/payments";
import ClientSettings from "@/pages/client/settings";
import PolicyPage from "@/pages/policy";
import ClientUsers from "@/pages/client/users";
import ClientBilling from "@/pages/client/billing";
import { getPostLoginPath } from "@/lib/auth-routing";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { ADMIN_ROUTE_PERMISSIONS, getFirstAccessibleAdminPath } from "@/lib/admin-navigation";

function ProtectedRoute({
  component: Component,
  requiredUserType,
  allowPasswordChange,
  requiredAdminPermissionsAnyOf,
  requiredAdminPermissionsAllOf,
}: {
  component: () => JSX.Element;
  requiredUserType?: "admin" | "client";
  allowPasswordChange?: boolean;
  requiredAdminPermissionsAnyOf?: string[];
  requiredAdminPermissionsAllOf?: string[];
}) {
  const { user, isLoading } = useAuth();
  const adminAccess = useAdminAccess();

  if (isLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (requiredUserType && user.userType !== requiredUserType) {
    return <Redirect to={getPostLoginPath(user)} />;
  }

  if (user.mustChangePassword && !allowPasswordChange) {
    return <Redirect to={getPostLoginPath(user)} />;
  }

  if (user.userType === "admin" && (requiredAdminPermissionsAnyOf || requiredAdminPermissionsAllOf)) {
    if (adminAccess.isLoading) {
      return <LoadingScreen message="Loading access..." />;
    }

    const satisfiesAny =
      !requiredAdminPermissionsAnyOf || adminAccess.hasAnyPermission(requiredAdminPermissionsAnyOf);
    const satisfiesAll =
      !requiredAdminPermissionsAllOf || adminAccess.hasAllPermissions(requiredAdminPermissionsAllOf);

    if (!satisfiesAny || !satisfiesAll) {
      return <Redirect to={getFirstAccessibleAdminPath(adminAccess.permissions)} />;
    }
  }

  return <Component />;
}

function AuthRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (user) {
    return <Redirect to={getPostLoginPath(user)} />;
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
        <ProtectedRoute
          component={AdminDashboard}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.dashboard.anyOf}
        />
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute component={AdminSettings} requiredUserType="admin" allowPasswordChange />
      </Route>
      <Route path="/admin/clients">
        <ProtectedRoute
          component={AdminClients}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.clients.anyOf}
        />
      </Route>
      <Route path="/admin/clients/:id/edit">
        <ProtectedRoute
          component={AdminEditClient}
          requiredUserType="admin"
          requiredAdminPermissionsAllOf={ADMIN_ROUTE_PERMISSIONS.editClient.allOf}
        />
      </Route>
      <Route path="/admin/applications">
        <ProtectedRoute
          component={AdminApplications}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.applications.anyOf}
        />
      </Route>
      <Route path="/admin/shipments">
        <ProtectedRoute
          component={AdminShipments}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.shipments.anyOf}
        />
      </Route>
      <Route path="/admin/invoices">
        <ProtectedRoute
          component={AdminInvoices}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.invoices.anyOf}
        />
      </Route>
      <Route path="/admin/pricing">
        <ProtectedRoute
          component={AdminPricing}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.pricing.anyOf}
        />
      </Route>
      <Route path="/admin/system-logs">
        <ProtectedRoute
          component={AdminSystemLogs}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.systemLogs.anyOf}
        />
      </Route>
      <Route path="/admin/audit-logs">
        <ProtectedRoute
          component={AdminAuditLogs}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.auditLogs.anyOf}
        />
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute
          component={AdminPayments}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.payments.anyOf}
        />
      </Route>
      <Route path="/admin/integration-logs">
        <ProtectedRoute
          component={AdminIntegrationLogs}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.integrations.anyOf}
        />
      </Route>
      <Route path="/admin/webhook-events">
        <ProtectedRoute
          component={AdminWebhookEvents}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.webhooks.anyOf}
        />
      </Route>
      <Route path="/admin/account-managers">
        <ProtectedRoute
          component={AdminAccountManagers}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.accountManagers.anyOf}
        />
      </Route>
      <Route path="/admin/rbac">
        <ProtectedRoute
          component={AdminRBAC}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.accessControl.anyOf}
        />
      </Route>
      <Route path="/admin/policies">
        <ProtectedRoute
          component={AdminPolicies}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.policies.anyOf}
        />
      </Route>
      <Route path="/admin/credit-invoices">
        <ProtectedRoute
          component={AdminCreditInvoices}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.creditInvoices.anyOf}
        />
      </Route>
      <Route path="/admin/credit-requests">
        <ProtectedRoute
          component={AdminCreditRequests}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.creditRequests.anyOf}
        />
      </Route>
      <Route path="/admin/email-templates">
        <ProtectedRoute
          component={AdminEmailTemplates}
          requiredUserType="admin"
          requiredAdminPermissionsAnyOf={ADMIN_ROUTE_PERMISSIONS.emailTemplates.anyOf}
        />
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
      <Route path="/client/billing">
        <ProtectedRoute component={ClientBilling} requiredUserType="client" />
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
