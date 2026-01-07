import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { NoShipments } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Eye, MapPin, Package, Calendar, DollarSign } from "lucide-react";
import type { Shipment } from "@shared/schema";
import { format } from "date-fns";

export default function AdminShipments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const { data: shipments, isLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/admin/shipments"],
  });

  const filteredShipments = shipments?.filter((shipment) => {
    const matchesSearch =
      shipment.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shipment.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shipment.recipientCity.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || shipment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading shipments..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-muted-foreground">
              Track and manage all shipments across clients
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking #, name, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="processing" data-testid="tab-processing">
                    Processing
                  </TabsTrigger>
                  <TabsTrigger value="in_transit" data-testid="tab-in-transit">
                    In Transit
                  </TabsTrigger>
                  <TabsTrigger value="delivered" data-testid="tab-delivered">
                    Delivered
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                    Cancelled
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Shipments Table */}
        <Card>
          <CardContent className="p-0">
            {filteredShipments && filteredShipments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipments.map((shipment) => (
                    <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                      <TableCell className="font-mono text-sm font-medium">
                        {shipment.trackingNumber}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {shipment.senderCity}, {shipment.senderCountry}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {shipment.recipientCity}, {shipment.recipientCountry}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {Number(shipment.weight).toFixed(1)} kg
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(shipment.finalPrice).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedShipment(shipment)}
                          data-testid={`button-view-${shipment.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <NoShipments />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shipment Detail Sheet */}
      <Sheet open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment Details
            </SheetTitle>
          </SheetHeader>

          {selectedShipment && (
            <div className="mt-6 space-y-6">
              {/* Tracking & Status */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tracking Number</p>
                  <p className="font-mono font-medium">{selectedShipment.trackingNumber}</p>
                </div>
                <StatusBadge status={selectedShipment.status} />
              </div>

              {/* Origin */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Origin</span>
                </div>
                <p className="font-medium">{selectedShipment.senderName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderAddress}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderCity}, {selectedShipment.senderCountry}
                </p>
                <p className="text-sm text-muted-foreground">{selectedShipment.senderPhone}</p>
              </div>

              {/* Destination */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Destination</span>
                </div>
                <p className="font-medium">{selectedShipment.recipientName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientAddress}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientCity}, {selectedShipment.recipientCountry}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.recipientPhone}
                </p>
              </div>

              {/* Package Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="text-lg font-medium">
                    {Number(selectedShipment.weight).toFixed(1)} kg
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Package Type</p>
                  <p className="text-lg font-medium capitalize">
                    {selectedShipment.packageType}
                  </p>
                </div>
              </div>

              {/* Pricing (Admin View) */}
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Pricing Breakdown</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base Rate</span>
                    <span>${Number(selectedShipment.baseRate).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Margin</span>
                    <span className="text-green-600 dark:text-green-400">
                      +${Number(selectedShipment.margin).toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Final Price</span>
                    <span>${Number(selectedShipment.finalPrice).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(selectedShipment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
