import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { CheckSquare, ChevronDown, Headset, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
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

interface OperationsLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  {
    href: "/operations",
    label: "Operations Hub",
    icon: LayoutDashboard,
    children: [
      { href: "/operations?view=d2d", label: "Door to Door" },
      { href: "/operations?view=express", label: "Express Shipments" },
      { href: "/operations?view=attention", label: "Needs Attention" },
      { href: "/operations?view=special", label: "Special Handling" },
      { href: "/operations?view=delivered", label: "Delivered" },
    ],
  },
  {
    href: "/operations/tasks",
    label: "Tasks",
    icon: CheckSquare,
    children: undefined,
  },
] as Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: Array<{ href: string; label: string }>;
}>;

interface OperationsNavSummary {
  ddpCount: number;
  expressCount: number;
  attentionCount: number;
  specialHandlingCount: number;
  deliveredCount: number;
}

export function OperationsLayout({ children }: OperationsLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [currentSearch, setCurrentSearch] = useState(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const currentPath = location.split("?")[0];
  const currentFullPath =
    typeof window === "undefined" ? location : `${currentPath}${currentSearch}`;
  const [openOperations, setOpenOperations] = useState(true);
  const { data: operationsSummary } = useQuery<OperationsNavSummary>({
    queryKey: ["/api/operations/summary"],
    refetchInterval: 180000,
  });

  const operationCounts = useMemo(
    () => ({
      "/operations?view=d2d": operationsSummary?.ddpCount ?? 0,
      "/operations?view=express": operationsSummary?.expressCount ?? 0,
      "/operations?view=attention": operationsSummary?.attentionCount ?? 0,
      "/operations?view=special": operationsSummary?.specialHandlingCount ?? 0,
      "/operations?view=delivered": operationsSummary?.deliveredCount ?? 0,
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

  const isHrefActive = (href: string) => {
    if (href.includes("?")) {
      return currentFullPath === href;
    }
    return currentPath === href || currentFullPath.startsWith(`${href}?`);
  };

  const navigateSidebarHref = (href: string) => {
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", href);
    window.dispatchEvent(new Event("ez-location-change"));
  };

  return (
    <div className="flex h-screen w-full">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <Link href="/operations" className="flex items-center gap-3">
            <img src="/assets/branding/logo.png" alt="ezhalha" className="h-9 w-auto" />
          </Link>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Headset className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Operations</p>
                <p className="text-xs text-muted-foreground">Shipment control room</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isHrefActive(item.href);
            if (!item.children) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateSidebarHref(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent",
                    isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              );
            }
            return (
              <div key={item.href} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setOpenOperations((value) => !value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent",
                    isActive || openOperations ? "bg-primary/10 text-primary" : "text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", openOperations && "rotate-180")} />
                </button>
                {openOperations && item.children ? (
                  <div className="ml-5 space-y-1 border-l border-sidebar-border/80 pl-4">
                    {item.children.map((child) => {
                      const childActive = isHrefActive(child.href);
                      const count = operationCounts[child.href as keyof typeof operationCounts];
                      return (
                        <button
                          key={child.href}
                          type="button"
                          onClick={() => navigateSidebarHref(child.href)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-[13px] font-medium transition-colors text-left",
                            childActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", childActive ? "bg-primary" : "bg-sidebar-foreground/30")} />
                          <span className="flex-1">{child.label}</span>
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
                                    : "bg-primary/10 text-primary",
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.username?.charAt(0).toUpperCase() || "O"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{user?.username}</p>
                  <p className="text-xs text-muted-foreground">Operations Team</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.username}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <Link href="/operations/settings">
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-end gap-2 border-b bg-background px-6">
          <NotificationBell />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
