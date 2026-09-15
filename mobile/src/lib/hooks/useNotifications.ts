import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppNotification, NOTIFICATIONS_QUERY_KEY, notificationsService } from "../services/notification";
import { queryClient } from "../queryClient";

export function useNotifications() {

    const {
        data: notifications = [],
        isLoading,
        refetch,
    } = useQuery<AppNotification[]>({
        queryKey: NOTIFICATIONS_QUERY_KEY,
        queryFn: notificationsService.list,
        refetchInterval: 60000,
    });

    // Local state so a pull-to-refresh spinner bound to this only reflects an
    // actual user pull, not the background refetchInterval tick (which keeps
    // firing while this screen is mounted-but-frozen underneath another
    // pushed screen and would otherwise leave a native RefreshControl stuck).
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await refetch();
        } finally {
            setIsRefreshing(false);
        }
    }, [refetch]);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.readAt).length,
        [notifications],
    );

    /*
     * Synchronous lock — Pressable's `disabled` prop and
     * mutation.isPending can both lag a frame behind a fast
     * double-tap, so a ref (not state) guards the mutate() call.
     */
    const isMarkingAllRef = useRef(false);

    const markReadMutation = useMutation({
        mutationFn: (notificationId: string) =>
            notificationsService.markRead(notificationId),

        onMutate: async (notificationId: string) => {
            await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
            const previous = queryClient.getQueryData<AppNotification[]>(
                NOTIFICATIONS_QUERY_KEY,
            );

            queryClient.setQueryData<AppNotification[]>(
                NOTIFICATIONS_QUERY_KEY,
                (old) =>
                    old?.map((n) =>
                        n.id === notificationId
                            ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
                            : n,
                    ) ?? [],
            );

            return { previous };
        },

        onError: (_error, _notificationId, context) => {
            if (context?.previous) {
                queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous);
            }
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => notificationsService.markAllRead(),

        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
            const previous = queryClient.getQueryData<AppNotification[]>(
                NOTIFICATIONS_QUERY_KEY,
            );

            queryClient.setQueryData<AppNotification[]>(
                NOTIFICATIONS_QUERY_KEY,
                (old) =>
                    old?.map((n) =>
                        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
                    ) ?? [],
            );

            return { previous };
        },

        onError: (_error, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous);
            }
        },

        // onSettled fires on both success AND failure, so the lock
        // always releases — this is what keeps the button from
        // getting stuck disabled after a failed request.
        onSettled: () => {
            isMarkingAllRef.current = false;
            queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });

    const markAllAsRead = () => {
        if (unreadCount === 0 || isMarkingAllRef.current) {
            return;
        }

        isMarkingAllRef.current = true;
        markAllReadMutation.mutate();
    };

    const openNotification = (notification: AppNotification) => {
        if (!notification.readAt) {
            markReadMutation.mutate(notification.id);
        }
    };

    return {
        notifications,
        isLoading,
        isRefreshing,
        unreadCount,
        markAllAsRead,
        isMarkingAllRead: markAllReadMutation.isPending,
        openNotification,
        refetch: refresh,
    };
}