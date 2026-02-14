import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClientLayout } from "@/components/client-layout";
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
import { Search, Plus, Eye, MapPin, Package, Calendar, Ban, Loader2 } from "lucide-react";
import { SarAmount } from "@/components/sar-symbol";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shipment, ClientAccount } from "@shared/schema";
import { format } from "date-fns";

export default function ClientShipments() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const { toast } = useToast();

  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: shipments, isLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/client/shipments"],
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/client/shipments/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/shipments/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/stats"] });
      setSelectedShipment(null);
      toast({
        title: "Shipment Cancelled",
        description: "Your shipment has been cancelled successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredShipments = shipments?.filter((shipment) => {
    const matchesSearch =
      shipment.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shipment.recipientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || shipment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <LoadingScreen message="Loading shipments..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-muted-foreground">
              Manage and track all your shipments
            </p>
          </div>
          <Button onClick={() => navigate("/client/shipments/new")} data-testid="button-create-shipment">
            <Plus className="mr-2 h-4 w-4" />
            Create Shipment
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking # or recipient..."
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
                    <TableHead>Recipient</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
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
                      <TableCell>{shipment.recipientName}</TableCell>
                      <TableCell className="text-sm">
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
              <NoShipments onCreateNew={() => navigate("/client/shipments/new")} />
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
                  <span className="text-sm font-medium">From</span>
                </div>
                <p className="font-medium">{selectedShipment.senderName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderAddress}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedShipment.senderCity}, {selectedShipment.senderCountry}
                </p>
              </div>

              {/* Destination */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">To</span>
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

              {/* Total Cost (Client only sees final price) */}
              <div className="p-4 rounded-lg border">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Cost</span>
                  <span className="text-2xl font-bold">
                    <SarAmount amount={selectedShipment.finalPrice} />
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(selectedShipment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </div>

              {/* Cancel Button - Only for processing shipments */}
              {selectedShipment.status === "processing" && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => cancelMutation.mutate(selectedShipment.id)}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-shipment"
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-2 h-4 w-4" />
                  )}
                  Cancel Shipment
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ClientLayout>
  );
}
