import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { StatusBadge } from "@/components/status-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditCard, CheckCircle } from "lucide-react";
import type { Payment, ClientAccount } from "@shared/schema";
import { format } from "date-fns";

export default function ClientPayments() {
  const { data: account } = useQuery<ClientAccount>({
    queryKey: ["/api/client/account"],
  });

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/client/payments"],
  });

  const totalPaid = payments
    ?.filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  if (isLoading) {
    return (
      <ClientLayout clientProfile={account?.profile}>
        <LoadingScreen message="Loading payments..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Payment History</h1>
            <p className="text-muted-foreground">
              View all your payment transactions
            </p>
          </div>
          {totalPaid > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">
                <span className="font-semibold">${totalPaid.toFixed(2)}</span> total paid
              </span>
            </div>
          )}
        </div>

        {/* Payments Table */}
        <Card>
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
                        ${Number(payment.amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Your payment history will appear here after you make your first payment."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
