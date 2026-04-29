import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  FileText,
  Package,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { ClientLayout } from "@/components/client-layout";
import { EmptyState } from "@/components/empty-state";
import { LoadingScreen } from "@/components/loading-spinner";
import { SarAmount } from "@/components/sar-symbol";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClientAccount, Invoice, Payment, Shipment } from "@shared/schema";

interface ClientExtraFeeNotice {
  shipmentId: string;
  trackingNumber: string;
  carrierTrackingNumber: string | null;
  carrierName: string | null;
  createdAt: string;
  extraFeesAmountSar: number;
  extraFeesType: "EXTRA_WEIGHT" | "EXTRA_COST" | "COMBINED" | null;
  extraFeesWeightValue: number;
  extraFeesCostAmountSar: number;
  extraWeightAmountSar: number;
  extraFeesAddedAt: string | null;
  extraFeesEmailSentAt: string | null;
  weightValue: number;
  weightUnit: string | null;
  grossTotalAmountSar: number;
  extraFeesRateSarPerWeight: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceDescription: string | null;
  invoiceAmountSar: number;
  invoiceDueDate: string | null;
}

const financialChartConfig: ChartConfig = {
  billed: {
    label: "Billed",
    color: "hsl(var(--chart-1))",
  },
  paid: {
    label: "Paid",
    color: "hsl(var(--chart-2))",
  },
};

const invoiceStatusColors = [
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return format(date, "MMM");
}

export default function ClientPayments() {
  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/client/payments"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/client/invoices"],
  });

  const { data: shipments, isLoading: shipmentsLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/client/shipments"],
  });

  const { data: extraFees, isLoading: extraFeesLoading } = useQuery<ClientExtraFeeNotice[]>({
    queryKey: ["/api/client/extra-fees"],
  });

  const completedPayments = payments?.filter((payment) => payment.status === "completed") ?? [];
  const paidInvoices = invoices?.filter((invoice) => invoice.status === "paid") ?? [];
  const openInvoices = invoices?.filter((invoice) => invoice.status !== "paid") ?? [];
  const paidShipments = shipments?.filter((shipment) => shipment.paymentStatus === "paid") ?? [];

  const totalPaid = completedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalInvoiced = invoices?.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) ?? 0;
  const outstandingBalance = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalShipmentSpend =
    shipments?.reduce((sum, shipment) => sum + Number(shipment.clientTotalAmountSar ?? shipment.finalPrice ?? 0), 0) ?? 0;
  const averageShipmentSpend = shipments?.length ? totalShipmentSpend / shipments.length : 0;
  const totalExtraFees =
    extraFees?.reduce((sum, fee) => sum + Number(fee.invoiceAmountSar || fee.extraFeesAmountSar || 0), 0) ?? 0;

  const monthlyFinancials = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - offset);
    const key = monthKey(date);

    monthlyFinancials.push({
      label: monthLabel(date),
      billed:
        invoices
          ?.filter((invoice) => monthKey(new Date(invoice.createdAt)) === key)
          .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) ?? 0,
      paid:
        completedPayments
          .filter((payment) => monthKey(new Date(payment.createdAt)) === key)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0) ?? 0,
    });
  }

  const invoiceStatusBreakdown = [
    { label: "Paid", value: paidInvoices.length },
    { label: "Open", value: openInvoices.length },
  ].filter((item) => item.value > 0);

  const formatExtraFeeLabel = (fee: ClientExtraFeeNotice) => {
    if (fee.extraFeesType === "COMBINED") return "Weight + Cost";
    if (fee.extraFeesType === "EXTRA_WEIGHT") return "Extra Weight";
    return "Extra Cost";
  };

  const formatExtraFeeDetails = (fee: ClientExtraFeeNotice) => {
    if (fee.extraFeesType === "COMBINED") {
      const details = [];
      if (fee.extraFeesWeightValue > 0) {
        details.push(
          `${fee.extraFeesWeightValue.toFixed(2)} ${fee.weightUnit || "KG"} at ${fee.extraFeesRateSarPerWeight.toFixed(2)} SAR/${fee.weightUnit || "KG"}`,
        );
      }
      if (fee.extraFeesCostAmountSar > 0) {
        details.push(`Manual extra cost: SAR ${fee.extraFeesCostAmountSar.toFixed(2)}`);
      }
      return details.join(" | ");
    }

    return fee.extraFeesType === "EXTRA_WEIGHT"
      ? `${fee.extraFeesWeightValue.toFixed(2)} ${fee.weightUnit || "KG"} at ${fee.extraFeesRateSarPerWeight.toFixed(2)} SAR/${fee.weightUnit || "KG"}`
      : `Manual extra cost: SAR ${fee.extraFeesCostAmountSar.toFixed(2)}`;
  };

  if (paymentsLoading || invoicesLoading || shipmentsLoading || extraFeesLoading) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <LoadingScreen message="Loading financial statements..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Financial Statements</h1>
            <p className="text-muted-foreground">
              Review your billed amounts, payments, shipment spending, and extra fees.
            </p>
          </div>
          {totalPaid > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">
                <span className="font-semibold"><SarAmount amount={totalPaid} /></span> paid to date
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <StatCard
            title="Total Invoiced"
            value={<SarAmount amount={totalInvoiced} showDecimals={false} />}
            icon={FileText}
          />
          <StatCard
            title="Total Paid"
            value={<SarAmount amount={totalPaid} showDecimals={false} />}
            icon={Wallet}
          />
          <StatCard
            title="Open Balance"
            value={<SarAmount amount={outstandingBalance} showDecimals={false} />}
            icon={AlertCircle}
          />
          <StatCard
            title="Shipment Spend"
            value={<SarAmount amount={totalShipmentSpend} showDecimals={false} />}
            icon={Package}
          />
          <StatCard
            title="Extra Fees"
            value={<SarAmount amount={totalExtraFees} showDecimals={false} />}
            icon={CreditCard}
          />
          <StatCard
            title="Average Shipment"
            value={<SarAmount amount={averageShipmentSpend} showDecimals={false} />}
            icon={Package}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Billed vs Paid (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyFinancials.some((entry) => entry.billed > 0 || entry.paid > 0) ? (
                <ChartContainer config={financialChartConfig} className="h-[260px] w-full">
                  <BarChart data={monthlyFinancials} accessibilityLayer>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value) => `${Number(value).toLocaleString()} SAR`} />}
                    />
                    <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="paid" fill="var(--color-paid)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-muted-foreground">
                  No financial activity yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {invoiceStatusBreakdown.length > 0 ? (
                <>
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={invoiceStatusBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={68}
                          paddingAngle={4}
                          dataKey="value"
                          nameKey="label"
                        >
                          {invoiceStatusBreakdown.map((entry, index) => (
                            <Cell key={entry.label} fill={invoiceStatusColors[index % invoiceStatusColors.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {invoiceStatusBreakdown.map((entry, index) => (
                      <div key={entry.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: invoiceStatusColors[index % invoiceStatusColors.length] }}
                          />
                          <span className="text-muted-foreground">{entry.label} invoices</span>
                        </div>
                        <span className="font-medium">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[160px] flex items-center justify-center text-muted-foreground">
                  No invoices yet
                </div>
              )}

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Completed payments</span>
                  <span className="font-medium">{completedPayments.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Paid shipments</span>
                  <span className="font-medium">{paidShipments.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total shipments</span>
                  <span className="font-medium">{shipments?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Open invoices</span>
                  <span className="font-medium">{openInvoices.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {extraFees && extraFees.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Extra Fee Notices</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Shipment adjustments added by the admin team appear here with their invoice status.
                </p>
              </div>
              <div className="text-sm font-medium">
                Total extra fees: <SarAmount amount={totalExtraFees} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extraFees.map((fee) => (
                    <TableRow key={`${fee.shipmentId}-${fee.extraFeesAddedAt || fee.createdAt}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-mono text-sm">{fee.trackingNumber}</p>
                          {fee.carrierTrackingNumber && (
                            <p className="text-xs text-muted-foreground">{fee.carrierTrackingNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatExtraFeeLabel(fee)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{fee.invoiceNumber || "Pending invoice creation"}</p>
                          {fee.invoiceDescription && (
                            <p className="text-xs text-muted-foreground">{fee.invoiceDescription}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatExtraFeeDetails(fee)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {fee.invoiceStatus ? (
                            <StatusBadge status={fee.invoiceStatus} />
                          ) : (
                            <Badge variant="secondary">Processing</Badge>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            {fee.invoiceStatus === "pending"
                              ? "Pay from the Invoices page"
                              : fee.extraFeesEmailSentAt
                                ? "Email sent"
                                : "In portal"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(fee.extraFeesAddedAt || fee.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <SarAmount amount={fee.invoiceAmountSar || fee.extraFeesAmountSar} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {payments && payments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                      <TableCell className="font-mono text-sm">
                        {payment.transactionId || payment.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="capitalize">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          {payment.paymentMethod}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={payment.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(payment.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <SarAmount amount={payment.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Your payment history will appear here after your first completed payment."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
