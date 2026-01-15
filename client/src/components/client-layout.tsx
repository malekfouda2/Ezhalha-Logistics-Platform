import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "./theme-toggle";
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
} from "lucide-react";

interface ClientLayoutProps {
  children: React.ReactNode;
  clientProfile?: string;
}

const navItems = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/shipments", label: "Shipments", icon: Package },
  { href: "/client/invoices", label: "Invoices", icon: FileText },
  { href: "/client/payments", label: "Payments", icon: CreditCard },
];

export function ClientLayout({ children, clientProfile = "regular" }: ClientLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/client" className="flex items-center gap-3">
            <img
              src="/assets/branding/logo.png"
              alt="ezhalha"
              className="h-9 w-auto"
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== "/client" && location.startsWith(item.href));
            const Icon = item.icon;
            
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
        </nav>

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
                    {user?.username?.charAt(0).toUpperCase() || "C"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{user?.username}</p>
                  <p className="text-xs text-muted-foreground">Client</p>
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
              <Link href="/client/settings">
                <DropdownMenuItem data-testid="menu-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Account Settings
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
        <header className="h-16 flex items-center justify-between gap-4 px-6 border-b bg-background">
          <div className="flex items-center gap-3">
            <ProfileBadge profile={clientProfile} />
          </div>
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
