import { api } from "@/api/client";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export const NOTIFICATIONS_QUERY_KEY = ["/api/notifications"] as const;

export const notificationsService = {
  async list(): Promise<AppNotification[]> {
    return api.get<AppNotification[]>("/api/notifications");
  },

  async markRead(notificationId: string): Promise<void> {
    await api.post(`/api/notifications/${notificationId}/read`);
  },

  async markAllRead(): Promise<void> {
    await api.post("/api/notifications/read-all");
  },

  async unreadCount(): Promise<{ count: number }> {
    return api.get<{ count: number }>("/api/notifications/unread-count");
  },
};