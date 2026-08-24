import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

type NotificationIcon =
  | {
      library: "feather";
      name: keyof typeof Feather.glyphMap;
    }
  | {
      library: "ionicons";
      name: keyof typeof Ionicons.glyphMap;
    };

const NOTIFICATION_CONFIG: Record<
  string,
  {
    icon: NotificationIcon;
    background: string;
    iconColor: string;
  }
> = {
  delivered: {
    icon: {
      library: "feather",
      name: "check",
    },
    background: "#D9F8E6",
    iconColor: "#147A43",
  },

  customs: {
    icon: {
      library: "ionicons",
      name: "warning-outline",
    },
    background: "#FFF3C7",
    iconColor: "#A47700",
  },

  invoice: {
    icon: {
      library: "feather",
      name: "file-text",
    },
    background: "#DCEAFF",
    iconColor: "#2855C5",
  },

  pickup: {
    icon: {
      library: "feather",
      name: "truck",
    },
    background: "#FFE5D8",
    iconColor: Colors.primary,
  },

  payment: {
    icon: {
      library: "feather",
      name: "credit-card",
    },
    background: "#F0E1FF",
    iconColor: "#7029B5",
  },
};

const DEFAULT_NOTIFICATION_CONFIG = {
  icon: {
    library: "ionicons",
    name: "notifications-outline",
  } satisfies NotificationIcon,
  background: "#E9EDF3",
  iconColor: Colors.textSecondary,
};

const formatNotificationTime = (
  dateString: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  const date = new Date(dateString);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return t("notifications.time.justNow");
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return t("notifications.time.justNow");
  }

  if (diffMinutes < 60) {
    return t("notifications.time.minutesAgo", {
      count: diffMinutes,
    });
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return t("notifications.time.hoursAgo", {
      count: diffHours,
    });
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return t("notifications.time.yesterday");
  }

  if (diffDays < 7) {
    return t("notifications.time.daysAgo", {
      count: diffDays,
    });
  }

  return date.toLocaleDateString();
};

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const {
    data: notifications = [],
    isLoading,
    isFetching,
  } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });

  /*
   * Number of unread notifications
   */
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  /*
   * Mark one notification as read
   */
  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("POST", `/api/notifications/${notificationId}/read`);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications"],
      });
    },
  });

  /*
   * Mark all notifications as read
   */
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications"],
      });
    },
  });

  /*
   * Navigate to notification action URL
   */
  const handleActionUrl = (actionUrl: string) => {
    try {
      /*
       * Relative URL
       *
       * Example:
       * /shipments/123
       */
      if (actionUrl.startsWith("/")) {
        router.push(actionUrl as any);
        return;
      }

      /*
       * Absolute URL
       *
       * Example:
       * https://example.com/shipments/123
       */
      const url = new URL(actionUrl);

      const path = `${url.pathname}${url.search}${url.hash}`;

      router.push(path as any);
    } catch (error) {
      console.warn("Invalid notification actionUrl:", actionUrl);
    }
  };

  /*
   * Open notification
   */
  const handleOpenNotification = (notification: AppNotification) => {
    /*
     * Mark as read if unread
     */
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }

    /*
     * Navigate if there is an action
     */
    if (notification.actionUrl) {
      handleActionUrl(notification.actionUrl);
    }
  };

  /*
   * Mark all as read
   */
  const markAllAsRead = () => {
    if (unreadCount === 0 || markAllReadMutation.isPending) {
      return;
    }

    markAllReadMutation.mutate();
  };

  /*
   * Render notification
   */
  const renderNotification: ListRenderItem<AppNotification> = ({
    item,
    index,
  }) => {
    const config =
      NOTIFICATION_CONFIG[item.type] ?? DEFAULT_NOTIFICATION_CONFIG;

    const isUnread = !item.readAt;

    return (
      <Pressable
        onPress={() => handleOpenNotification(item)}
        style={({ pressed }) => [
          styles.notification,
          isUnread && styles.unreadNotification,
          index === notifications.length - 1 && styles.lastNotification,
          pressed && styles.pressed,
        ]}
      >
        {/* Icon */}
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: config.background,
            },
          ]}
        >
          {config.icon.library === "feather" ? (
            <Feather
              name={config.icon.name}
              size={rs(20)}
              color={config.iconColor}
            />
          ) : (
            <Ionicons
              name={config.icon.name}
              size={rs(20)}
              color={config.iconColor}
            />
          )}
        </View>

        {/* Content */}
        <View style={styles.notificationContent}>
          <Text size="medium" weight="bold" numberOfLines={1}>
            {item.title}
          </Text>

          <Text
            size="small"
            dimRate="65%"
            style={styles.description}
            numberOfLines={2}
          >
            {item.body}
          </Text>

          <Text size="small" dimRate="55%" style={styles.time}>
            {formatNotificationTime(item.createdAt, t)}
          </Text>
        </View>

        {/* Unread indicator */}
        {isUnread && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text size="xxl" weight="bold">
            {t("notifications.title")}
          </Text>

          <Pressable
            onPress={markAllAsRead}
            hitSlop={rs(10)}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
          >
            <Text
              size="large"
              weight="bold"
              style={[
                styles.markAll,
                unreadCount === 0 && styles.markAllDisabled,
              ]}
            >
              {markAllReadMutation.isPending
                ? t("notifications.marking")
                : t("notifications.markAllRead")}{" "}
            </Text>
          </Pressable>
        </View>

        {/* Notification card */}
        <View style={styles.notificationCard}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={notifications}
              renderItem={renderNotification}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshing={isFetching && !isLoading}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons
                      name="notifications-off-outline"
                      size={rs(28)}
                      color={Colors.textSecondary}
                    />
                  </View>
                  <Text
                    size="medium"
                    weight="semibold"
                    style={styles.emptyTitle}
                  >
                    {t("notifications.empty.title")}
                  </Text>

                  <Text
                    size="small"
                    dimRate="55%"
                    style={styles.emptyDescription}
                  >
                    {t("notifications.empty.description")}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  header: {
    paddingHorizontal: rs(25),
    paddingBottom: rvs(16),

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  markAll: {
    color: Colors.primary,
    fontSize: rs(15),
    lineHeight: rvs(20),
  },

  markAllDisabled: {
    opacity: 0.45,
  },

  notificationCard: {
    flex: 1,

    marginHorizontal: rs(25),
    marginBottom: rs(25),

    borderRadius: rs(24),

    overflow: "hidden",

    backgroundColor: Colors.white,
  },

  notification: {
    minHeight: rvs(125),

    paddingHorizontal: rs(15),
    paddingVertical: rvs(18),

    flexDirection: "row",
    alignItems: "flex-start",

    backgroundColor: Colors.white,

    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  unreadNotification: {
    backgroundColor: "#FFF9F6",
  },

  lastNotification: {
    borderBottomWidth: 0,
  },

  iconContainer: {
    width: rs(40),
    height: rs(40),

    borderRadius: rs(14),

    alignItems: "center",
    justifyContent: "center",

    flexShrink: 0,
  },

  notificationContent: {
    flex: 1,

    marginStart: rs(15),
    marginEnd: rs(20),

    minWidth: 0,
  },

  description: {
    marginTop: rvs(3),

    color: Colors.textSecondary,
  },

  time: {
    marginTop: rvs(7),

    color: Colors.textSecondary,
  },

  unreadDot: {
    position: "absolute",

    top: rvs(12),
    end: rs(18),

    width: rs(12),
    height: rs(12),

    borderRadius: rs(6),

    backgroundColor: Colors.primary,
  },

  pressed: {
    opacity: 0.75,
  },

  loadingContainer: {
    flex: 1,

    minHeight: rvs(200),

    alignItems: "center",
    justifyContent: "center",
  },

  emptyContainer: {
    minHeight: rvs(300),

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: rs(30),
  },

  emptyIconContainer: {
    width: rs(56),
    height: rs(56),

    borderRadius: rs(18),

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: Colors.background,

    marginBottom: rvs(12),
  },

  emptyTitle: {
    color: Colors.text,
  },

  emptyDescription: {
    marginTop: rvs(4),

    color: Colors.textSecondary,

    textAlign: "center",
  },
});
