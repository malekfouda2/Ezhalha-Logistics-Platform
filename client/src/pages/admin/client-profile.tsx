import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  Ban,
  Building2,
  CreditCard,
  Edit,
  FileText,
  Package,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { carrierBrandName } from "@shared/carriers";
import { COUNTRY_CODE_OPTIONS } from "@shared/countries";

const COUNTRY_NAMES = new Map(COUNTRY_CODE_OPTIONS.map((c) => [c.code, c.name]));

interface ClientAnalytics {
  client: {
    id: string;
    name: string;
    accountNumber: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    city: string | null;
    profile: string | null;
    isActive: boolean;
    createdAt: string;
  };
  totals: {
    shipments: number;
    activeShipments: number;
    cancelledShipments: number;
    cancelledValueSar: number;
    grossBilledSar: number;
    revenueExTaxSar: number;
    costSar: number;
    netProfitSar: number;
    marginPct: number;
    collectedSar: number;
    outstandingSar: number;
    avgShipmentValueSar: number;
    avgProfitPerShipmentSar: number;
    totalWeightKg: number;
  };
  history: {
    firstShipmentAt: string | null;
    lastShipmentAt: string | null;
    userCount: number;
    activeUserCount: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byFulfillment: Record<string, number>;
    byCarrier: { carrierCode: string; shipments: number; revenueSar: number }[];
    topDestinations: { key: string; count: number }[];
    topOrigins: { key: string; count: number }[];
  };
  monthly: { month: string; shipments: number; revenueSar: number; profitSar: number }[];
  credit: { enabled: boolean; limit: number; outstanding: number; available: number };
  invoices: {
    count: number;
    paidCount: number;
    paidSar: number;
    openCount: number;
    openSar: number;
    overdueCount: number;
    overdueSar: number;
  };
  paymentCount: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0);

const FULFILLMENT_LABELS: Record<string, string> = {
  carrier: "Express",
  local: "Local",
  ddp_manual: "Door to Door",
};

function countryName(code: string) {
  return COUNTRY_NAMES.get(code) ?? code;
}

/** A headline figure. `tone` marks the two that carry judgement: profit and money owed. */
function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "profit" | "owed";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                tone === "profit" ? "text-emerald-600 dark:text-emerald-500" : tone === "owed" ? "text-amber-600 dark:text-amber-500" : ""
              }`}
            >
              {value}
            </p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminClientProfile() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const adminAccess = useAdminAccess();
  const canUpdateClients = adminAccess.hasPermission("clients", "update");

  const { data, isLoading, error } = useQuery<ClientAnalytics>({
    queryKey: ["/api/admin/clients", id, "analytics"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${id}/analytics`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load client analytics");
      return res.json();
    },
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading client profile..." />
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="p-6">
          <Button variant="ghost" onClick={() => setLocation("/admin/clients")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to clients
          </Button>
          <p className="text-muted-foreground">This client could not be loaded.</p>
        </div>
      </AdminLayout>
    );
  }

  const { client, totals, history, breakdown, monthly, credit, invoices } = data;
  const peakRevenue = Math.max(1, ...monthly.map((m) => m.revenueSar));

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin/clients")}
              className="-ml-2 mb-2"
              data-testid="button-back-to-clients"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Clients
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="text-client-name">
                {client.name}
              </h1>
              <Badge variant={client.isActive ? "default" : "secondary"}>
                {client.isActive ? "Active" : "Inactive"}
              </Badge>
              {client.profile && <Badge variant="outline" className="capitalize">{client.profile.replace(/_/g, " ")}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {client.accountNumber && <span className="font-mono">{client.accountNumber}</span>}
              {client.email && <> · {client.email}</>}
              {client.phone && <> · {client.phone}</>}
              {client.country && <> · {countryName(client.country)}</>}
            </p>
          </div>
          {canUpdateClients && (
            <Button variant="outline" onClick={() => setLocation(`/admin/clients/${client.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit details
            </Button>
          )}
        </div>

        {/* Money first — it is the reason this page exists. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Net profit"
            value={`SAR ${money(totals.netProfitSar)}`}
            sub={`${totals.marginPct}% margin · SAR ${money(totals.avgProfitPerShipmentSar)} per shipment`}
            icon={TrendingUp}
            tone="profit"
          />
          <Stat
            label="Billed to client"
            value={`SAR ${money(totals.grossBilledSar)}`}
            sub={`SAR ${money(totals.revenueExTaxSar)} excl. VAT · cost SAR ${money(totals.costSar)}`}
            icon={Wallet}
          />
          <Stat
            label="Outstanding"
            value={`SAR ${money(totals.outstandingSar)}`}
            sub={`SAR ${money(totals.collectedSar)} collected`}
            icon={CreditCard}
            tone={totals.outstandingSar > 0 ? "owed" : undefined}
          />
          <Stat
            label="Shipments"
            value={String(totals.activeShipments)}
            sub={`${totals.totalWeightKg} kg · avg SAR ${money(totals.avgShipmentValueSar)}`}
            icon={Package}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Monthly activity</CardTitle>
            </CardHeader>
            <CardContent>
              {monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shipments yet.</p>
              ) : (
                <div className="space-y-3">
                  {monthly.map((row) => (
                    <div key={row.month} className="space-y-1" data-testid={`row-month-${row.month}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{format(new Date(`${row.month}-01T00:00:00Z`), "MMM yyyy")}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {row.shipments} shipment{row.shipments === 1 ? "" : "s"} · SAR {money(row.revenueSar)}
                          <span className="ml-2 text-emerald-600 dark:text-emerald-500">+{money(row.profitSar)}</span>
                        </span>
                      </div>
                      <Progress value={(row.revenueSar / peakRevenue) * 100} className="h-1.5" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relationship</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Client since</span>
                <span className="font-medium">{format(new Date(client.createdAt), "d MMM yyyy")}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">First shipment</span>
                <span className="font-medium">
                  {history.firstShipmentAt ? format(new Date(history.firstShipmentAt), "d MMM yyyy") : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last shipment</span>
                <span className="font-medium">
                  {history.lastShipmentAt ? format(new Date(history.lastShipmentAt), "d MMM yyyy") : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Portal users</span>
                <span className="font-medium">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  {history.activeUserCount} active of {history.userCount}
                </span>
              </div>
              {totals.cancelledShipments > 0 && (
                <div className="flex justify-between gap-3 border-t border-border pt-3">
                  <span className="text-muted-foreground">
                    <Ban className="mr-1 inline h-3.5 w-3.5" />
                    Cancelled
                  </span>
                  <span className="font-medium">
                    {totals.cancelledShipments} · SAR {money(totals.cancelledValueSar)} not billed
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium">{invoices.paidCount} · SAR {money(invoices.paidSar)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Open</span>
                <span className="font-medium">{invoices.openCount} · SAR {money(invoices.openSar)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Overdue</span>
                <span className={`font-medium ${invoices.overdueCount > 0 ? "text-destructive" : ""}`}>
                  {invoices.overdueCount} · SAR {money(invoices.overdueSar)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Credit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {credit.enabled ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Limit</span>
                    <span className="font-medium">SAR {money(credit.limit)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-medium">SAR {money(credit.outstanding)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Available</span>
                    <span className="font-medium">SAR {money(credit.available)}</span>
                  </div>
                  {credit.limit > 0 && (
                    <Progress value={(credit.outstanding / credit.limit) * 100} className="h-1.5" />
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Credit is not enabled for this client.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(breakdown.byFulfillment).length === 0 ? (
                <p className="text-muted-foreground">No shipments yet.</p>
              ) : (
                Object.entries(breakdown.byFulfillment).map(([type, count]) => (
                  <div key={type} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{FULFILLMENT_LABELS[type] ?? type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))
              )}
              <div className="border-t border-border pt-2">
                {Object.entries(breakdown.byStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{status.replace(/_/g, " ")}</span>
                    <span className="tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carriers used</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {breakdown.byCarrier.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No shipments yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Carrier</TableHead>
                      <TableHead className="text-right">Shipments</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.byCarrier.map((row) => (
                      <TableRow key={row.carrierCode}>
                        <TableCell>
                          {carrierBrandName(row.carrierCode) || (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.shipments}</TableCell>
                        <TableCell className="text-right tabular-nums">SAR {money(row.revenueSar)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where they ship</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Building2 className="mr-1 inline h-3.5 w-3.5" />
                  Top origins
                </p>
                {breakdown.topOrigins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  breakdown.topOrigins.map((row) => (
                    <div key={row.key} className="flex justify-between gap-3 text-sm">
                      <span>{countryName(row.key)}</span>
                      <span className="tabular-nums text-muted-foreground">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <FileText className="mr-1 inline h-3.5 w-3.5" />
                  Top destinations
                </p>
                {breakdown.topDestinations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  breakdown.topDestinations.map((row) => (
                    <div key={row.key} className="flex justify-between gap-3 text-sm">
                      <span>{countryName(row.key)}</span>
                      <span className="tabular-nums text-muted-foreground">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
