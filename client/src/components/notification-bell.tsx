import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("POST", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const handleOpenNotification = (notification: AppNotification) => {
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      const url = new URL(notification.actionUrl, window.location.origin);
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing new yet.
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                    !notification.readAt && "bg-primary/5",
                  )}
                  onClick={() => handleOpenNotification(notification)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
                        notification.readAt ? "bg-muted-foreground/30" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{notification.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
