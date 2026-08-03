import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/loading-spinner";
import { apiRequest, readJsonResponse } from "@/lib/queryClient";
import { platformMeta } from "@/lib/platform-meta";
import type { ClientAccount } from "@shared/schema";
import { Inbox, Package, ArrowRight } from "lucide-react";

interface OrderRow {
  id: string;
  externalOrderNumber: string | null;
  externalOrderId: string;
  salesChannelId: string;
  status: string;
  customer: string | null;
  shipTo: string | null;
  packageWeightKg: string | null;
  packagePieces: number;
  assignedCarrierCode: string | null;
  shipmentId: string | null;
}

interface SalesChannel {
  id: string;
  platform: string;
  name: string;
  carrierMode?: string;
}

const statusColor: Record<string, string> = {
  new: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  assigned: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  shipped: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  delivered: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

function parseJson<T>(value: string | null): T | Record<string, never> {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

const selectClass = "h-8 rounded-full border px-3 text-xs font-semibold bg-background";

export default function OrdersPage() {
  const [, navigate] = useLocation();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: channels } = useQuery<SalesChannel[]>({ queryKey: ["/api/client/sales-channels"] });
  const { data: orders, isLoading } = useQuery<OrderRow[]>({
    queryKey: ["/api/client/orders", "all"],
    queryFn: async () => readJsonResponse<OrderRow[]>(await apiRequest("GET", "/api/client/orders")),
  });

  const [channelFilter, setChannelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const channelMap = useMemo(() => {
    const m: Record<string, SalesChannel> = {};
    (channels || []).forEach((c) => (m[c.id] = c));
    return m;
  }, [channels]);

  const filtered = (orders || []).filter(
    (o) => (!channelFilter || o.salesChannelId === channelFilter) && (!statusFilter || o.status === statusFilter),
  );

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Sales Channels / Orders</p>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">
            Orders synced from your stores. Pick a carrier (manual) or let rules assign it (auto), then pay and ship.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select className={selectClass} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} data-testid="filter-channel">
            <option value="">All channels</option>
            {(channels || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="filter-status">
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="assigned">Assigned</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !filtered.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-primary/10 mb-4"><Inbox className="h-8 w-8 text-primary" /></div>
              <h3 className="font-semibold mb-1">No orders {orders?.length ? "match this filter" : "yet"}</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Orders appear here automatically once a connected store sends them.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Pieces</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((order) => {
                    const customer = parseJson<{ name?: string }>(order.customer);
                    const shipTo = parseJson<{ city?: string; region?: string }>(order.shipTo);
                    const ch = channelMap[order.salesChannelId];
                    const chMeta = ch ? platformMeta(ch.platform) : null;
                    const auto = ch?.carrierMode === "auto";
                    return (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-semibold">#{order.externalOrderNumber || order.externalOrderId}</TableCell>
                        <TableCell>
                          {chMeta ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded grid place-items-center text-white font-extrabold" style={{ background: chMeta.color, width: 20, height: 20, fontSize: 8 }}>{chMeta.code}</span>
                              <span className="text-xs">{chMeta.label}</span>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">{customer.name || "—"}</TableCell>
                        <TableCell>{[shipTo.city, shipTo.region].filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell>{order.packagePieces}</TableCell>
                        <TableCell>{order.packageWeightKg ? `${Number(order.packageWeightKg)} kg` : "—"}</TableCell>
                        <TableCell>
                          {order.assignedCarrierCode ? (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{order.assignedCarrierCode}</Badge>
                          ) : auto ? (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Auto</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">— pick —</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColor[order.status] || ""}>{order.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {order.shipmentId ? (
                            <Button variant="ghost" size="sm" onClick={() => navigate("/client/shipments")}>
                              Track <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          ) : order.status === "cancelled" ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button size="sm" onClick={() => navigate(`/client/orders/${order.id}/fulfill`)} data-testid={`button-fulfill-${order.id}`}>
                              <Package className="h-3.5 w-3.5 mr-1.5" /> Fulfill
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}
