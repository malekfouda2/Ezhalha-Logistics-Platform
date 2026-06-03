import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClientLayout } from "@/components/client-layout";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { Package, Truck, CheckCircle, FileText, Plus, ArrowRight, Crown, Star, Users, Gift, Clock } from "lucide-react";
import { SarSymbol, SarAmount } from "@/components/sar-symbol";
import { Link } from "wouter";
import { ProfileBadge } from "@/components/profile-badge";
import type { ClientDashboardStats, Shipment, ClientAccount } from "@shared/schema";
import { format } from "date-fns";

const shipmentChartConfig: ChartConfig = {
  value: {
    label: "Shipments",
    color: "hsl(var(--primary))",
  },
};

const STATUS_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-1))",
];

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const profileTierInfo: Record<string, { name: string; icon: typeof Crown; color: string }> = {
  regular: {
    name: "Regular",
    icon: Users,
    color: "text-muted-foreground",
  },
  mid_level: {
    name: "Mid-Level",
    icon: Star,
    color: "text-blue-500",
  },
  vip: {
    name: "VIP",
    icon: Crown,
    color: "text-amber-500",
  },
};

type ActiveRecoveryOffer = {
  shipmentId: string;
  trackingNumber: string;
  recipientName: string;
  destination: string;
  carrierName?: string | null;
  serviceType?: string | null;
  currency: string;
  createdAt: string;
  offer: {
    recoveryId: string;
    discountType: string | null;
    discountValue: number;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
    expiresAt: string | null;
    channel: string | null;
  };
};

export default function ClientDashboard() {
  const [, navigate] = useLocation();

  const { data: account, isLoading: accountLoading } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ClientDashboardStats>({
    queryKey: ["/api/client/stats"],
  });

  const { data: recentShipments, isLoading: shipmentsLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/client/shipments/recent"],
  });

  const { data: activeOffers } = useQuery<ActiveRecoveryOffer[]>({
    queryKey: ["/api/client/abandoned-recovery/offers"],
  });

  if (accountLoading || statsLoading) {
    return (
      <ClientLayout>
        <LoadingScreen message="Loading dashboard..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">Welcome back!</h1>
              <p className="text-muted-foreground">
                Here's an overview of your shipping activity
              </p>
            </div>
            {account?.profile && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border" data-testid="profile-tier-display">
                {(() => {
                  const tierInfo = profileTierInfo[account.profile] || profileTierInfo.regular;
                  const TierIcon = tierInfo.icon;
                  return (
                    <>
                      <div className={`p-2 rounded-full bg-background ${tierInfo.color}`}>
                        <TierIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tierInfo.name} Tier</span>
                          <ProfileBadge profile={account.profile} />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <Button onClick={() => navigate("/client/shipments/new")} data-testid="button-create-shipment">
            <Plus className="mr-2 h-4 w-4" />
            Create Shipment
          </Button>
        </div>

        {activeOffers && activeOffers.length > 0 && (
          <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/10 via-amber-500/10 to-background">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                    <Gift className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">Active recovery offer</p>
                    <h2 className="text-xl font-bold">
                      Save <SarAmount amount={activeOffers[0].offer.discountAmount} /> on shipment {activeOffers[0].trackingNumber}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Complete payment for {activeOffers[0].destination || activeOffers[0].recipientName} before the offer expires.
                    </p>
                    {activeOffers[0].offer.expiresAt && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Expires {format(new Date(activeOffers[0].offer.expiresAt), "MMM d, h:mm a")}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-xl border bg-background/70 px-4 py-3 text-sm">
                    <div className="text-muted-foreground line-through">
                      <SarAmount amount={activeOffers[0].offer.originalAmount} />
                    </div>
                    <div className="text-lg font-extrabold">
                      <SarAmount amount={activeOffers[0].offer.finalAmount} />
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate(`/client/shipments?resumeShipment=${activeOffers[0].shipmentId}`)}
                    data-testid="button-resume-active-offer"
                  >
                    Resume Payment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
              {activeOffers.length > 1 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  You have {activeOffers.length - 1} more active offer{activeOffers.length - 1 === 1 ? "" : "s"} waiting in your shipments.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard
            title="Total Shipments"
            value={stats?.totalShipments ?? 0}
            icon={Package}
            trend={stats?.trends?.shipments}
          />
          <StatCard
            title="In Transit"
            value={stats?.shipmentsInTransit ?? 0}
            icon={Truck}
          />
          <StatCard
            title="Delivered"
            value={stats?.shipmentsDelivered ?? 0}
            icon={CheckCircle}
            trend={stats?.trends?.delivered}
          />
          <StatCard
            title="Pending Invoices"
            value={stats?.pendingInvoices ?? 0}
            icon={FileText}
          />
          <StatCard
            title="Total Spent"
            value={<SarAmount amount={stats?.totalSpent ?? 0} showDecimals={false} />}
            icon={Package}
            trend={stats?.trends?.spent}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Shipment Activity (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.shipmentsByMonth && stats.shipmentsByMonth.some((d) => d.value > 0) ? (
                <ChartContainer config={shipmentChartConfig} className="h-[220px] w-full">
                  <BarChart data={stats.shipmentsByMonth} accessibilityLayer>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                  No shipment data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.statusDistribution && stats.statusDistribution.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={60}
                          paddingAngle={3}
                          dataKey="count"
                          nameKey="status"
                        >
                          {stats.statusDistribution.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {stats.statusDistribution.map((item, index) => (
                      <div key={item.status} className="flex items-center justify-between text-sm" data-testid={`status-legend-${item.status}`}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{formatStatusLabel(item.status)}</span>
                        </div>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="h-10 w-10 mb-2 opacity-50" />
                  <p>No data yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <CardTitle className="text-lg">Recent Shipments</CardTitle>
            <Link href="/client/shipments">
              <Button variant="ghost" size="sm" data-testid="link-all-shipments">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {shipmentsLoading ? (
              <div className="h-48 flex items-center justify-center">
                <LoadingScreen message="Loading shipments..." />
              </div>
            ) : recentShipments && recentShipments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment ID</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentShipments.slice(0, 5).map((shipment) => (
                    <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                      <TableCell className="font-mono text-sm font-medium">
                        {shipment.trackingNumber}
                      </TableCell>
                      <TableCell>
                        {shipment.recipientCity}, {shipment.recipientCountry}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(shipment.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <SarAmount amount={shipment.finalPrice} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <Package className="h-10 w-10 mb-4 opacity-50" />
                <p className="mb-4">No shipments yet</p>
                <Button onClick={() => navigate("/client/shipments/new")} data-testid="button-first-shipment">
                  Create Your First Shipment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/shipments/new")} data-testid="card-action-create-shipment">
            <CardContent className="p-6 text-center">
              <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">Create Shipment</h3>
              <p className="text-sm text-muted-foreground">
                Start a new shipment request
              </p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/shipments")} data-testid="card-action-track-shipments">
            <CardContent className="p-6 text-center">
              <div className="p-4 rounded-full bg-blue-500/10 w-fit mx-auto mb-4">
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="font-semibold mb-1">Track Shipments</h3>
              <p className="text-sm text-muted-foreground">
                Monitor your active shipments
              </p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/invoices")} data-testid="card-action-view-invoices">
            <CardContent className="p-6 text-center">
              <div className="p-4 rounded-full bg-green-500/10 w-fit mx-auto mb-4">
                <FileText className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="font-semibold mb-1">View Invoices</h3>
              <p className="text-sm text-muted-foreground">
                Access your billing history
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}
