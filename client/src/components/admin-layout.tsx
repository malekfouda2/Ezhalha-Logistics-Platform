import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { ADMIN_NAV_ITEMS, hasAdminPermissionAccess } from "@/lib/admin-navigation";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
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
  RotateCcw,
  Headset,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface OperationsNavSummary {
  ddpCount: number;
  expressCount: number;
  attentionCount: number;
  specialHandlingCount: number;
  deliveredCount: number;
}

const iconByHref = {
  "/admin": LayoutDashboard,
  "/admin/users": Users,
  "/admin/clients": Users,
  "/admin/applications": ClipboardList,
  "/admin/operations": Headset,
  "/admin/shipments": Package,
  "/admin/shipments/abandoned": Package,
  "/admin/financial-management": Banknote,
  "/admin/invoices": FileText,
  "/admin/payments": CreditCard,
  "/admin/refund-requests": RotateCcw,
  "/admin/credit-requests": ShieldCheck,
  "/admin/credit-invoices": Clock,
  "/admin/pricing": Banknote,
  "/admin/ddp-pricing": Banknote,
  "/admin/system": Settings,
  "/admin/system-logs": Bug,
  "/admin/audit-logs": Shield,
  "/admin/integration-logs": Plug,
  "/admin/apps": Plug,
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
  const [currentSearch, setCurrentSearch] = useState(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const currentPath = location.split("?")[0];
  const currentFullPath =
    typeof window === "undefined" ? location : `${currentPath}${currentSearch}`;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const handleLogout = async () => {
    await logout();
  };

  const visibleNavItems = useMemo(
    () =>
      adminAccess.isLoading
        ? []
        : ADMIN_NAV_ITEMS.filter((item) =>
            hasAdminPermissionAccess(adminAccess.permissions, item.permissions),
          ),
    [adminAccess.isLoading, adminAccess.permissions],
  );

  const canViewOperations = !adminAccess.isLoading && visibleNavItems.some((item) => item.href === "/admin/operations");
  const { data: operationsSummary } = useQuery<OperationsNavSummary>({
    queryKey: ["/api/operations/summary"],
    enabled: canViewOperations,
    refetchInterval: 180000,
  });

  const operationCounts = useMemo(
    () => ({
      "/admin/operations?view=d2d": operationsSummary?.ddpCount ?? 0,
      "/admin/operations?view=express": operationsSummary?.expressCount ?? 0,
      "/admin/operations?view=attention": operationsSummary?.attentionCount ?? 0,
      "/admin/operations?view=special": operationsSummary?.specialHandlingCount ?? 0,
      "/admin/operations?view=delivered": operationsSummary?.deliveredCount ?? 0,
    }),
    [operationsSummary],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateSearch = () => setCurrentSearch(window.location.search);
    window.addEventListener("popstate", updateSearch);
    window.addEventListener("ez-location-change", updateSearch as EventListener);
    return () => {
      window.removeEventListener("popstate", updateSearch);
      window.removeEventListener("ez-location-change", updateSearch as EventListener);
    };
  }, []);

  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of visibleNavItems) {
        if (!item.children?.length) continue;
        const sectionActive =
          currentPath === item.href ||
          currentPath.startsWith(`${item.href}/`) ||
          currentFullPath.startsWith(`${item.href}?`);
        if (!(item.href in next)) {
          next[item.href] = sectionActive;
          changed = true;
          continue;
        }
        if (sectionActive) {
          if (!next[item.href]) {
            next[item.href] = true;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [currentFullPath, currentPath, visibleNavItems]);

  const isHrefActive = (href: string) => {
    if (href.includes("?")) {
      return currentFullPath === href;
    }
    return currentPath === href || (href !== "/admin" && currentPath.startsWith(href));
  };

  const navigateSidebarHref = (href: string) => {
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", href);
    window.dispatchEvent(new Event("ez-location-change"));
  };

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
            const isActive = isHrefActive(item.href);
            const Icon = iconByHref[item.href as keyof typeof iconByHref] || Package;
            const visibleChildren = item.children?.filter((child) =>
              hasAdminPermissionAccess(adminAccess.permissions, child.permissions),
            );

            if (visibleChildren?.length) {
              const isOpen = openSections[item.href] ?? isActive;
              return (
                <div key={item.href} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSections((current) => ({
                        ...current,
                        [item.href]: !(current[item.href] ?? isActive),
                      }))
                    }
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors hover-elevate active-elevate-2",
                      isActive || isOpen
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 flex-shrink-0 transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {isOpen && (
                    <div className="space-y-1 border-l border-sidebar-border/80 ml-5 pl-4">
                      {visibleChildren.map((child) => {
                        const childActive = isHrefActive(child.href);
                        const childCount = operationCounts[child.href as keyof typeof operationCounts];
                        return (
                          <button
                            key={child.href}
                            type="button"
                            onClick={() => navigateSidebarHref(child.href)}
                            data-testid={`nav-${child.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-[13px] font-medium transition-colors text-left",
                              childActive
                                ? "bg-primary/10 text-primary"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full flex-shrink-0",
                                childActive ? "bg-primary" : "bg-sidebar-foreground/30"
                              )}
                            />
                            <span className="flex-1">{child.label}</span>
                            {typeof childCount === "number" && item.href === "/admin/operations" ? (
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  child.href.includes("attention")
                                    ? "bg-red-500/10 text-red-500"
                                    : child.href.includes("special")
                                      ? "bg-amber-500/10 text-amber-500"
                                      : child.href.includes("delivered")
                                        ? "bg-green-500/10 text-green-500"
                                      : child.href.includes("express")
                                        ? "bg-blue-500/10 text-blue-500"
                                        : "bg-primary/10 text-primary"
                                )}
                              >
                                {childCount}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            
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
          <NotificationBell />
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
