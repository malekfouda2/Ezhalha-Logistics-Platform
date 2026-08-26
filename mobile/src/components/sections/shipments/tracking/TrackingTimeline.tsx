import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import {
  rs,
  rvs,
  responsiveFontSize,
} from "@/utils/responsive";
import { TrackingEvent } from "@/lib/services/shipmentTracking";

interface TrackingTimelineProps {
  events: TrackingEvent[];
}

function formatEventDate(iso?: string, prefix?: string) {
  if (!iso) return prefix ?? "";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return prefix ?? "";
  }

  const day = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${day} · ${time}`;
}

export function TrackingTimeline({ events }: TrackingTimelineProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const lineActive = event.completed;

        return (
          <View key={event.key} style={styles.row}>
            <View style={styles.indicatorColumn}>
              <View
                style={[
                  styles.dot,
                  event.completed && styles.dotCompleted,
                  event.active &&
                    !event.completed &&
                    styles.dotActive,
                ]}
              >
                {event.completed && (
                  <Ionicons
                    name="checkmark"
                    size={responsiveFontSize(14)}
                    color={Colors.white}
                  />
                )}
              </View>

              {!isLast && (
                <View
                  style={[
                    styles.line,
                    lineActive
                      ? styles.lineActive
                      : styles.lineInactive,
                  ]}
                />
              )}
            </View>

            <View
              style={[
                styles.textColumn,
                !isLast && { paddingBottom: rvs(28) },
              ]}
            >
              <Text
                size="large"
                weight="bold"
                style={
                  !event.completed && !event.active
                    ? { color: Colors.textSecondary }
                    : undefined
                }
              >
                {event.title}
              </Text>

              <Text
                size="small"
                dimRate="70%"
                style={styles.subLabel}
              >
                {event.timestamp
                  ? [
                      formatEventDate(event.timestamp),
                      event.location,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : event.expectedTimestamp
                  ? t("shipments.tracking.expected", {
                      date: formatEventDate(
                        event.expectedTimestamp
                      ),
                    })
                  : t("shipments.tracking.pending")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT_SIZE = rs(36);

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
  },
  indicatorColumn: {
    alignItems: "center",
    width: DOT_SIZE,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderWidth: rs(2),
    borderColor: Colors.border,
  },
  dotCompleted: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotActive: {
    borderColor: Colors.primary,
    borderWidth: rs(3),
  },
  line: {
    width: rs(2.5),
    flex: 1,
    minHeight: rvs(28),
    marginTop: rs(2),
  },
  lineActive: {
    backgroundColor: Colors.primary,
  },
  lineInactive: {
    backgroundColor: Colors.border,
  },
  textColumn: {
    flex: 1,
    marginLeft: rs(16),
  },
  subLabel: {
    marginTop: rs(2),
  },
});