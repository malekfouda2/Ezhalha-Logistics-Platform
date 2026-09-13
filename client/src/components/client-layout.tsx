import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { useGuestMode } from "@/lib/guest-mode";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { ProfileBadge } from "./profile-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Package,
  FileText,
  CreditCard,
  User,
  LogOut,
  ChevronDown,
  Settings,
  Users,
  ScrollText,
  Clock,
  Menu,
  Store,
  Inbox,
  SlidersHorizontal,
  Calculator,
} from "lucide-react";

interface ClientLayoutProps {
  children: React.ReactNode;
  clientProfile?: string;
}

type PermissionId = "view_shipments" | "create_shipments" | "view_invoices" | "view_payments" | "make_payments" | "manage_users";

interface MyPermissions {
  permissions: PermissionId[];
  isPrimaryContact: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: PermissionId;
  salesFeature?: boolean;
}

const navItems: NavItem[] = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/quick-quote", label: "Quick Quote", icon: Calculator, requiredPermission: "create_shipments" },
  { href: "/client/shipments", label: "Shipments", icon: Package, requiredPermission: "view_shipments" },
  { href: "/client/orders", label: "Orders", icon: Inbox, requiredPermission: "create_shipments", salesFeature: true },
  { href: "/client/sales-channels", label: "Sales Channels", icon: Store, requiredPermission: "create_shipments", salesFeature: true },
  { href: "/client/assignment-rules", label: "Assignment Rules", icon: SlidersHorizontal, requiredPermission: "create_shipments", salesFeature: true },
  { href: "/client/invoices", label: "Invoices", icon: FileText, requiredPermission: "view_invoices" },
  { href: "/client/payments", label: "Financial Statements", icon: CreditCard, requiredPermission: "view_payments" },
  { href: "/client/billing", label: "Credit / Billing", icon: Clock, requiredPermission: "view_invoices" },
  { href: "/client/users", label: "Team", icon: Users, requiredPermission: "manage_users" },
];

export function ClientLayout({ children, clientProfile = "regular" }: ClientLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { isGuest, end: endGuest } = useGuestMode();

  const { data: myPerms } = useQuery<MyPermissions>({
    queryKey: ["/api/client/my-permissions"],
  });

  const { data: salesFeature } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/client/sales-features"],
  });
  const salesEnabled = salesFeature?.enabled ?? false;

  const hasPermission = (perm: PermissionId): boolean => {
    if (!myPerms) return false;
    if (myPerms.isPrimaryContact) return true;
    return myPerms.permissions.includes(perm);
  };

  const filteredNavItems = navItems.filter(item => {
    // Bundled Sales Channels feature — hidden until enabled for the account.
    if (item.salesFeature && !salesEnabled) return false;
    if (!item.requiredPermission) return true;
    if (!myPerms) return false;
    return hasPermission(item.requiredPermission);
  });

  // When the feature is off, expose a single entry point so the client can request it.
  if (!salesEnabled && hasPermission("create_shipments")) {
    const shipmentsIdx = filteredNavItems.findIndex((i) => i.href === "/client/shipments");
    const requestItem: NavItem = { href: "/client/sales-channels", label: "Sales Channels", icon: Store, requiredPermission: "create_shipments" };
    filteredNavItems.splice(shipmentsIdx >= 0 ? shipmentsIdx + 1 : filteredNavItems.length, 0, requestItem);
  }

  const handleLogout = async () => {
    await logout();
  };

  const handleExitGuest = () => {
    endGuest();
    navigate("/");
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center px-6 border-b border-sidebar-border">
        <Link href="/client" className="flex items-center justify-center gap-3" onClick={closeMobileNav}>
          <img
            src="/assets/branding/logo.png"
            alt="ezhalha"
            className="h-12 w-auto"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const isActive = location === item.href ||
            (item.href !== "/client" && location.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} onClick={closeMobileNav}>
              <div
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-primary to-[hsl(14_100%_46%)] text-primary-foreground shadow-md shadow-primary/25"
                    : "text-sidebar-foreground hover-elevate active-elevate-2 hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground/90" />
                )}
                <Icon className={cn("h-5 w-5 flex-shrink-0 transition-transform", isActive && "scale-110")} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Policy Links */}
      <div className="px-3 pb-2 space-y-1">
        <Link href="/policy/privacy-policy" onClick={closeMobileNav}>
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-muted-foreground hover-elevate active-elevate-2"
            data-testid="nav-privacy-policy"
          >
            <ScrollText className="h-4 w-4 flex-shrink-0" />
            <span>Privacy Policy</span>
          </div>
        </Link>
        <Link href="/policy/shipping-return-policy" onClick={closeMobileNav}>
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-muted-foreground hover-elevate active-elevate-2"
            data-testid="nav-shipping-policy"
          >
            <ScrollText className="h-4 w-4 flex-shrink-0" />
            <span>Shipping & Return Policy</span>
          </div>
        </Link>
      </div>

      {/* User Menu */}
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate active-elevate-2"
              data-testid="button-client-menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {isGuest ? "G" : user?.username?.charAt(0).toUpperCase() || "C"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{isGuest ? "Guest" : user?.username}</p>
                <p className="text-xs text-muted-foreground">{isGuest ? "Not signed in" : "Client"}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{isGuest ? "Guest" : user?.username}</p>
              <p className="text-xs text-muted-foreground">
                {isGuest ? "Browsing without an account" : user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <Link href="/client/settings" onClick={closeMobileNav}>
              <DropdownMenuItem data-testid="menu-settings">
                <Settings className="mr-2 h-4 w-4" />
                Account Settings
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={isGuest ? handleExitGuest : handleLogout}
              data-testid="menu-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {isGuest ? "Exit guest mode" : "Logout"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-sidebar-border flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar (drawer) */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b bg-background">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden flex items-center justify-center h-9 w-9 -ml-1 rounded-md hover-elevate active-elevate-2"
              aria-label="Open navigation"
              data-testid="button-open-nav"
            >
              <Menu className="h-5 w-5" />
            </button>
            <ProfileBadge profile={clientProfile} />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Guest-mode banner — a guest is browsing without an account, and should always know it. */}
        {isGuest && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2.5 sm:px-6"
            data-testid="guest-banner"
          >
            <p className="text-sm">
              <span className="font-medium">You're browsing as a guest.</span>{" "}
              <span className="text-muted-foreground">
                Build a shipment and see live rates — you'll need an account to pay.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => navigate("/apply?resume=1")} data-testid="button-guest-signup">
                Create an account
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExitGuest}
                data-testid="button-guest-exit"
              >
                Exit
              </Button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gradient-to-b from-background via-background to-muted/25">
          <div key={location} className="animate-fade-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
