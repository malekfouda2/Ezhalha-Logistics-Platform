// components/ui/DatePickerField.tsx
import { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface DatePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
  minimumDate?: Date | null;
  maximumDate?: Date | null;
  placeholder?: string;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(date: Date | null) {
  if (!date) return "dd/mm/yyyy";

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  // Always keep exactly 6 rows = 42 cells
  while (cells.length < 42) {
    cells.push(null);
  }

  return cells;
}

interface CalendarModalProps {
  title: string;
  value: Date | null;
  minimumDate?: Date | null;
  maximumDate?: Date | null;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

function CalendarModal({
  title,
  value,
  minimumDate,
  maximumDate,
  onSelect,
  onClose,
}: CalendarModalProps) {
  const initial = value ?? new Date();

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const [showYearPicker, setShowYearPicker] = useState(false);

  const cells = buildMonthGrid(viewYear, viewMonth);

  const currentYear = new Date().getFullYear();
  const startYear = 1900;

  // 1900 -> current year
  const years = Array.from(
    { length: currentYear - startYear + 1 },
    (_, index) => startYear + index
  );

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((year) => year - 1);
    } else {
      setViewMonth((month) => month - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((year) => year + 1);
    } else {
      setViewMonth((month) => month + 1);
    }
  };

  const isDisabled = (date: Date) => {
    if (minimumDate && date < stripTime(minimumDate)) {
      return true;
    }

    if (maximumDate && date > stripTime(maximumDate)) {
      return true;
    }

    return false;
  };

  const handleYearSelect = (year: number) => {
    setViewYear(year);
    setShowYearPicker(false);
  };

  const handleToday = () => {
    const now = new Date();

    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setShowYearPicker(false);

    if (!isDisabled(now)) {
      onSelect(now);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <Text
            size="large"
            weight="bold"
            style={styles.sheetTitle}
          >
            {title}
          </Text>

          {/* Calendar Header */}
          <View style={styles.calendarHeader}>
            {/* Previous Month */}
            <Pressable
              style={styles.navButton}
              onPress={goToPrevMonth}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={rs(20)}
                color={Colors.text}
              />
            </Pressable>

            {/* Month + Year */}
            <Pressable
              style={styles.monthYearButton}
              onPress={() => setShowYearPicker((prev) => !prev)}
            >
              <Text size="medium" weight="semibold">
                {MONTH_LABELS[viewMonth]} {viewYear}
              </Text>

              <Ionicons
                name={
                  showYearPicker
                    ? "chevron-up"
                    : "chevron-down"
                }
                size={rs(16)}
                color={Colors.text}
              />
            </Pressable>

            {/* Next Month */}
            <Pressable
              style={styles.navButton}
              onPress={goToNextMonth}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={rs(20)}
                color={Colors.text}
              />
            </Pressable>
          </View>

          {showYearPicker ? (
            /* ==================== YEAR PICKER ==================== */
            <ScrollView
              style={styles.yearScroll}
              contentContainerStyle={styles.yearGrid}
              showsVerticalScrollIndicator={false}
            >
              {years.map((year) => {
                const selected = year === viewYear;

                return (
                  <Pressable
                    key={year}
                    style={styles.yearCell}
                    onPress={() => handleYearSelect(year)}
                  >
                    <View
                      style={[
                        styles.yearCircle,
                        selected && styles.yearSelected,
                      ]}
                    >
                      <Text
                        size="small"
                        weight={
                          selected ? "bold" : "regular"
                        }
                        style={{
                          color: selected
                            ? Colors.white
                            : Colors.text,
                        }}
                      >
                        {year}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            /* ==================== MONTH CALENDAR ==================== */
            <>
              {/* Weekdays */}
              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((wd, index) => (
                  <View
                    key={`${wd}-${index}`}
                    style={styles.cell}
                  >
                    <Text
                      size="xs"
                      weight="semibold"
                      dimRate="60%"
                    >
                      {wd}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Days */}
              <View style={styles.grid}>
                {cells.map((date, index) => {
                  if (!date) {
                    return (
                      <View
                        key={`empty-${index}`}
                        style={styles.cell}
                      />
                    );
                  }

                  const selected = value
                    ? isSameDay(date, value)
                    : false;

                  const today = isSameDay(date, new Date());

                  const disabled = isDisabled(date);

                  return (
                    <Pressable
                      key={date.toISOString()}
                      disabled={disabled}
                      onPress={() => onSelect(date)}
                      style={styles.cell}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          selected && styles.daySelected,
                          today &&
                            !selected &&
                            styles.dayToday,
                        ]}
                      >
                        <Text
                          size="small"
                          weight={
                            selected
                              ? "bold"
                              : "regular"
                          }
                          style={{
                            color: disabled
                              ? Colors.placeholder
                              : selected
                              ? Colors.white
                              : Colors.text,
                          }}
                        >
                          {date.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Today */}
          <View style={styles.footerRow}>
            <Pressable
              style={styles.todayButton}
              onPress={handleToday}
            >
              <Text
                size="medium"
                weight="semibold"
                style={{
                  color: Colors.primary,
                }}
              >
                Today
              </Text>
            </Pressable>
          </View>

          {/* Done */}
          <Button
            title="Done"
            onPress={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DatePickerField({
  label,
  value,
  onChange,
  onClear,
  minimumDate,
  maximumDate,
  placeholder,
}: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.fieldWrapper}>
      <Text
        size="small"
        weight="medium"
        dimRate="70%"
        style={styles.fieldLabel}
      >
        {label}
      </Text>

      <Pressable
        onPress={() => setVisible(true)}
        style={styles.selectBox}
      >
        <Text
          size="medium"
          style={{
            color: value
              ? Colors.text
              : Colors.placeholder,
          }}
        >
          {value
            ? formatDate(value)
            : placeholder ?? "dd/mm/yyyy"}
        </Text>

        {value && onClear ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onClear();
            }}
            hitSlop={8}
          >
            <Ionicons
              name="close-circle"
              size={rs(18)}
              color={Colors.placeholder}
            />
          </Pressable>
        ) : (
          <Ionicons
            name="calendar-outline"
            size={rs(18)}
            color={Colors.placeholder}
          />
        )}
      </Pressable>

      {visible && (
        <CalendarModal
          title={label}
          value={value}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onSelect={onChange}
          onClose={() => setVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrapper: {
    marginBottom: rvs(14),
  },

  fieldLabel: {
    marginBottom: rvs(6),
  },

  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: rvs(48),
    paddingHorizontal: rs(14),
    borderRadius: rs(12),
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },

  sheet: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(20),
    gap: rvs(12),
  },

  sheetTitle: {
    marginBottom: rvs(4),
  },

  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  monthYearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingHorizontal: rs(12),
    paddingVertical: rvs(8),
  },

  navButton: {
    padding: rs(10),
    borderRadius: rs(10),
    backgroundColor: Colors.inputBackground,
  },

  weekdayRow: {
    flexDirection: "row",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: rvs(40 * 6),
  },

  cell: {
    width: `${100 / 7}%`,
    height: rvs(40),
    alignItems: "center",
    justifyContent: "center",
  },

  dayCircle: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    alignItems: "center",
    justifyContent: "center",
  },

  daySelected: {
    backgroundColor: Colors.primary,
  },

  dayToday: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  /* ==================== YEAR PICKER ==================== */

  yearScroll: {
    height: rvs(240),
  },

  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  yearCell: {
    width: "25%",
    height: rvs(48),
    alignItems: "center",
    justifyContent: "center",
  },

  yearCircle: {
    minWidth: rs(56),
    height: rvs(36),
    paddingHorizontal: rs(8),
    borderRadius: rs(18),
    alignItems: "center",
    justifyContent: "center",
  },

  yearSelected: {
    backgroundColor: Colors.primary,
  },

  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  todayButton: {
    paddingHorizontal: rs(14),
    paddingVertical: rvs(8),
  },
});