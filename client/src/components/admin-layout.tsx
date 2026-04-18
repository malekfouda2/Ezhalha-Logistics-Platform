import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { ADMIN_NAV_ITEMS, hasAdminPermissionAccess } from "@/lib/admin-navigation";
import { ThemeToggle } from "./theme-toggle";
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
  Users,
  FileText,
  Package,
  Settings,
  LogOut,
  ChevronDown,
  Banknote,
  ClipboardList,
  Shield,
  CreditCard,
  Plug,
  Webhook,
  ScrollText,
  Clock,
  ShieldCheck,
  Mail,
  Bug,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const iconByHref = {
  "/admin": LayoutDashboard,
  "/admin/clients": Users,
  "/admin/applications": ClipboardList,
  "/admin/shipments": Package,
  "/admin/invoices": FileText,
  "/admin/payments": CreditCard,
  "/admin/credit-requests": ShieldCheck,
  "/admin/credit-invoices": Clock,
  "/admin/pricing": Banknote,
  "/admin/system-logs": Bug,
  "/admin/audit-logs": Shield,
  "/admin/integration-logs": Plug,
  "/admin/webhook-events": Webhook,
  "/admin/account-managers": Users,
  "/admin/rbac": Shield,
  "/admin/email-templates": Mail,
  "/admin/policies": ScrollText,
} as const;

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const adminAccess = useAdminAccess();

  const handleLogout = async () => {
    await logout();
  };

  const visibleNavItems = adminAccess.isLoading
    ? []
    : ADMIN_NAV_ITEMS.filter((item) =>
        hasAdminPermissionAccess(adminAccess.permissions, item.permissions),
      );

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/admin" className="flex items-center gap-3">
            <img
              src="/assets/branding/logo.png"
              alt="ezhalha"
              className="h-9 w-auto"
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== "/admin" && location.startsWith(item.href));
            const Icon = iconByHref[item.href];
            
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors hover-elevate active-elevate-2",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
          {!adminAccess.isLoading && visibleNavItems.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No admin sections are assigned to this account yet.
            </div>
          )}
        </nav>

        {/* User Menu */}
        <div className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate active-elevate-2"
                data-testid="button-admin-menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {user?.username?.charAt(0).toUpperCase() || "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{user?.username}</p>
                  <p className="text-xs text-muted-foreground">Administrator</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.username}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <Link href="/admin/settings">
                <DropdownMenuItem data-testid="menu-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-end gap-2 px-6 border-b bg-background">
          <ThemeToggle />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
