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
  Users,
  Package,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Link } from "wouter";
import type { AdminDashboardStats, Shipment, ClientApplication } from "@shared/schema";
import { format } from "date-fns";

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
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back! Here's what's happening with ezhalha.
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Clients"
            value={stats?.totalClients ?? 0}
            icon={Users}
            trend={{ value: 12, label: "vs last month" }}
          />
          <StatCard
            title="Active Shipments"
            value={stats?.shipmentsInTransit ?? 0}
            icon={Package}
            trend={{ value: 8, label: "vs last week" }}
          />
          <StatCard
            title="Pending Applications"
            value={stats?.pendingApplications ?? 0}
            icon={FileText}
          />
          <StatCard
            title="Monthly Revenue"
            value={`$${(stats?.monthlyRevenue ?? 0).toLocaleString()}`}
            icon={DollarSign}
            trend={{ value: 15, label: "vs last month" }}
          />
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Shipments */}
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
                      <TableHead>Tracking #</TableHead>
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
                          ${Number(shipment.finalPrice).toFixed(2)}
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

          {/* Pending Applications */}
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
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
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
                          {app.country} {app.companyName && `• ${app.companyName}`}
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

        {/* Performance Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">
                  {stats?.totalShipments ?? 0}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Total Shipments</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {stats?.shipmentsDelivered ?? 0}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Delivered</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {stats?.shipmentsInTransit ?? 0}
                </p>
                <p className="text-sm text-muted-foreground mt-1">In Transit</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">
                  ${(stats?.totalRevenue ?? 0).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
