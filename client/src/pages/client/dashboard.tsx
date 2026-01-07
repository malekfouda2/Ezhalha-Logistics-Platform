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
import { Package, Truck, CheckCircle, FileText, Plus, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import type { ClientDashboardStats, Shipment, ClientAccount } from "@shared/schema";
import { format } from "date-fns";

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
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Welcome back!</h1>
            <p className="text-muted-foreground">
              Here's an overview of your shipping activity
            </p>
          </div>
          <Button onClick={() => navigate("/client/shipments/new")} data-testid="button-create-shipment">
            <Plus className="mr-2 h-4 w-4" />
            Create Shipment
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Shipments"
            value={stats?.totalShipments ?? 0}
            icon={Package}
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
          />
          <StatCard
            title="Pending Invoices"
            value={stats?.pendingInvoices ?? 0}
            icon={FileText}
          />
        </div>

        {/* Recent Shipments */}
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
                    <TableHead>Tracking #</TableHead>
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
                        ${Number(shipment.finalPrice).toFixed(2)}
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/shipments/new")}>
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

          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/shipments")}>
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

          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/client/invoices")}>
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
