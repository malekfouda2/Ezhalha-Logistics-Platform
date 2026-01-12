import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import type { WebhookEvent } from "@shared/schema";
import { format } from "date-fns";

export default function AdminWebhookEvents() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const { data: events, isLoading } = useQuery<WebhookEvent[]>({
    queryKey: ["/api/admin/webhook-events"],
  });

  const filteredEvents = events?.filter((event) => {
    const matchesSearch =
      event.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.errorMessage?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = sourceFilter === "all" || event.source === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const uniqueSources = Array.from(new Set(events?.map((e) => e.source) || []));

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading webhook events..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Webhook Events</h1>
            <p className="text-muted-foreground">
              Monitor incoming webhooks from FedEx, Stripe, and other services
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {events?.length || 0} total events
            </Badge>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {events?.filter(e => e.processed).length || 0} processed
            </Badge>
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              {events?.filter(e => !e.processed).length || 0} pending
            </Badge>
          </div>
        </div>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-webhook-events"
                />
              </div>
              <Tabs value={sourceFilter} onValueChange={setSourceFilter}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All
                  </TabsTrigger>
                  {uniqueSources.map((source) => (
                    <TabsTrigger key={source} value={source} data-testid={`tab-${source}`}>
                      {source}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {filteredEvents && filteredEvents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id} data-testid={`row-webhook-event-${event.id}`}>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(event.createdAt), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.source}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{event.eventType}</TableCell>
                      <TableCell>
                        {event.processed ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Processed
                          </Badge>
                        ) : event.errorMessage ? (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {event.retryCount > 0 ? event.retryCount : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {event.errorMessage || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No webhook events found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
