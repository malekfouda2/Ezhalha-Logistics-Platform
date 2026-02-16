import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
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
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Package,
  FileText,
  ArrowRight,
  Clock,
  Banknote,
} from "lucide-react";
import { SarSymbol, SarAmount, formatSAR } from "@/components/sar-symbol";
import { Link } from "wouter";
import type { AdminDashboardStats, Shipment, ClientApplication } from "@shared/schema";
import { format } from "date-fns";

const shipmentChartConfig: ChartConfig = {
  value: {
    label: "Shipments",
    color: "hsl(var(--primary))",
  },
};

const revenueChartConfig: ChartConfig = {
  value: {
    label: "Revenue",
    color: "hsl(var(--chart-2))",
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

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminDashboardStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: recentShipments, isLoading: shipmentsLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/admin/shipments/recent"],
  });

  const { data: pendingApplications, isLoading: appsLoading } = useQuery<ClientApplication[]>({
    queryKey: ["/api/admin/applications/pending"],
  });

  if (statsLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading dashboard..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back! Here's what's happening with ezhalha.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Clients"
            value={stats?.totalClients ?? 0}
            icon={Users}
            trend={stats?.trends?.clients}
          />
          <StatCard
            title="Active Shipments"
            value={stats?.shipmentsInTransit ?? 0}
            icon={Package}
            trend={stats?.trends?.shipments}
          />
          <StatCard
            title="Pending Applications"
            value={stats?.pendingApplications ?? 0}
            icon={FileText}
          />
          <StatCard
            title="Monthly Revenue"
            value={<SarAmount amount={stats?.monthlyRevenue ?? 0} showDecimals={false} />}
            icon={Banknote}
            trend={stats?.trends?.revenue}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shipments (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.shipmentsByMonth && stats.shipmentsByMonth.length > 0 ? (
                <ChartContainer config={shipmentChartConfig} className="h-[250px] w-full">
                  <BarChart data={stats.shipmentsByMonth} accessibilityLayer>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No shipment data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revenue (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.revenueByMonth && stats.revenueByMonth.some((d) => d.value > 0) ? (
                <ChartContainer config={revenueChartConfig} className="h-[250px] w-full">
                  <AreaChart data={stats.revenueByMonth} accessibilityLayer>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v} SAR`} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toLocaleString()} SAR`} />} />
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-value)"
                      fill="url(#revenueGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No revenue data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
              <CardTitle className="text-lg">Recent Shipments</CardTitle>
              <Link href="/admin/shipments">
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
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentShipments.slice(0, 5).map((shipment) => (
                      <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                        <TableCell className="font-mono text-sm">
                          {shipment.trackingNumber}
                        </TableCell>
                        <TableCell>
                          {shipment.recipientCity}, {shipment.recipientCountry}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.status} />
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
                  <Package className="h-10 w-10 mb-2 opacity-50" />
                  <p>No recent shipments</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shipment Status</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.statusDistribution && stats.statusDistribution.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
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
                <div className="h-[250px] flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="h-10 w-10 mb-2 opacity-50" />
                  <p>No shipment data yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Performance Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary" data-testid="stat-total-shipments">
                    {stats?.totalShipments ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Total Shipments</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="stat-delivered">
                    {stats?.shipmentsDelivered ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Delivered</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="stat-in-transit">
                    {stats?.shipmentsInTransit ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">In Transit</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold" data-testid="stat-total-revenue">
                    <SarAmount amount={stats?.totalRevenue ?? 0} showDecimals={false} />
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Total Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
              <CardTitle className="text-lg">Pending Applications</CardTitle>
              <Link href="/admin/applications">
                <Button variant="ghost" size="sm" data-testid="link-all-applications">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {appsLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <LoadingScreen message="Loading..." />
                </div>
              ) : pendingApplications && pendingApplications.length > 0 ? (
                <div className="space-y-4">
                  {pendingApplications.slice(0, 4).map((app) => (
                    <div
                      key={app.id}
                      className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`card-application-${app.id}`}
                    >
                      <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{app.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {app.email}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {app.country} {app.companyName && `- ${app.companyName}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="h-10 w-10 mb-2 opacity-50" />
                  <p>No pending applications</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
