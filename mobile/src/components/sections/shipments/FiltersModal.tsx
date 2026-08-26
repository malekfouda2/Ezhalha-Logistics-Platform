// components/sections/shipments/FiltersModal.tsx
import { useState, useEffect } from "react";
import { Modal, View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { useTranslation } from "react-i18next";

export interface ShipmentFilters {
  carrier: string | null;
  paymentStatus: string | null;
  method: string | null;
  origin: string | null;
  destination: string | null;
  createdFrom: Date | null;
  createdTo: Date | null;
}

export const EMPTY_FILTERS: ShipmentFilters = {
  carrier: null,
  paymentStatus: null,
  method: null,
  origin: null,
  destination: null,
  createdFrom: null,
  createdTo: null,
};

export function countActiveFilters(filters: ShipmentFilters): number {
  return Object.values(filters).filter((v) => v !== null && v !== "").length;
}

type OptionField =
  | "carrier"
  | "paymentStatus"
  | "method"
  | "origin"
  | "destination";

interface Option {
  label: string;
  value: string;
}

const CARRIER_OPTIONS: Option[] = [
  { label: "FedEx", value: "fedex" },
  { label: "DHL", value: "dhl" },
  { label: "UPS", value: "ups" },
  { label: "Aramex", value: "aramex" },
];

const PAYMENT_OPTIONS: Option[] = [
  { label: "shipments.filters.paymentOptions.paid", value: "paid" },
  { label: "shipments.filters.paymentOptions.pending", value: "pending" },
  { label: "shipments.filters.paymentOptions.unpaid", value: "unpaid" },
];

const METHOD_OPTIONS: Option[] = [
  { label: "shipments.filters.methodOptions.air", value: "air" },
  { label: "shipments.filters.methodOptions.sea", value: "sea" },
  { label: "shipments.filters.methodOptions.domestic", value: "domestic" },
  {
    label: "shipments.filters.methodOptions.expressImport",
    value: "express_import",
  },
  {
    label: "shipments.filters.methodOptions.expressExport",
    value: "express_export",
  },
];

const ORIGIN_OPTIONS: Option[] = [
  {
    label: "shipments.filters.locationOptions.china",
    value: "cn",
  },
  {
    label: "shipments.filters.locationOptions.uae",
    value: "uae",
  },
  {
    label: "shipments.filters.locationOptions.saudiArabia",
    value: "sa",
  },
  {
    label: "shipments.filters.locationOptions.other",
    value: "other",
  },
];

const DESTINATION_OPTIONS = ORIGIN_OPTIONS;

const FIELD_CONFIG: Record<
  OptionField,
  { label: string; placeholder: string; options: Option[] }
> = {
  carrier: {
    label: "shipments.filters.carrier",
    placeholder: "shipments.filters.anyCarrier",
    options: CARRIER_OPTIONS,
  },
  paymentStatus: {
    label: "shipments.filters.payment",
    placeholder: "shipments.filters.anyPaymentStatus",
    options: PAYMENT_OPTIONS,
  },
  method: {
    label: "shipments.filters.method",
    placeholder: "shipments.filters.anyMethod",
    options: METHOD_OPTIONS,
  },
  origin: {
    label: "shipments.filters.origin",
    placeholder: "shipments.filters.anyOrigin",
    options: ORIGIN_OPTIONS,
  },
  destination: {
    label: "shipments.filters.destination",
    placeholder: "shipments.filters.anyDestination",
    options: DESTINATION_OPTIONS,
  },
};

interface SelectFieldProps {
  field: OptionField;
  value: string | null;
  onOpen: (field: OptionField) => void;
  active: boolean;
}

function SelectField({ field, value, onOpen, active }: SelectFieldProps) {
  const { t } = useTranslation();
  const config = FIELD_CONFIG[field];

  const selectedLabel = config.options.find((o) => o.value === value)?.label;

  return (
    <View style={styles.fieldWrapper}>
      <Text
        size="small"
        weight="medium"
        dimRate="70%"
        style={styles.fieldLabel}
      >
        {t(config.label)}
      </Text>

      <Pressable
        onPress={() => onOpen(field)}
        style={[styles.selectBox, active && styles.selectBoxActive]}
      >
        <Text
          size="medium"
          style={{
            color: selectedLabel ? Colors.text : Colors.placeholder,
          }}
        >
          {selectedLabel || t(config.placeholder)}
        </Text>

        <Ionicons
          name="chevron-down"
          size={rs(18)}
          color={Colors.placeholder}
        />
      </Pressable>
    </View>
  );
}

interface OptionPickerProps {
  field: OptionField;
  currentValue: string | null;
  onSelect: (field: OptionField, value: string | null) => void;
  onClose: () => void;
}

function OptionPickerSheet({
  field,
  currentValue,
  onSelect,
  onClose,
}: OptionPickerProps) {
  const { t } = useTranslation();
  const config = FIELD_CONFIG[field];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable
          style={styles.pickerSheet}
          onPress={(e) => e.stopPropagation()}
        >
          <Text size="large" weight="bold" style={styles.pickerTitle}>
            {t(config.label)}
          </Text>

          <ScrollView>
            <Pressable
              style={styles.pickerOption}
              onPress={() => {
                onSelect(field, null);
                onClose();
              }}
            >
              <Text
                size="medium"
                weight={!currentValue ? "semibold" : "regular"}
              >
                {t(config.placeholder)}
              </Text>

              {!currentValue && (
                <Ionicons
                  name="checkmark"
                  size={rs(18)}
                  color={Colors.primary}
                />
              )}
            </Pressable>

            {config.options.map((option) => {
              const isSelected = currentValue === option.value;

              return (
                <Pressable
                  key={option.value}
                  style={styles.pickerOption}
                  onPress={() => {
                    onSelect(field, option.value);
                    onClose();
                  }}
                >
                  <Text
                    size="medium"
                    weight={isSelected ? "semibold" : "regular"}
                  >
                    {t(option.label)}
                  </Text>

                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={rs(18)}
                      color={Colors.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface FiltersModalProps {
  visible: boolean;
  initialFilters: ShipmentFilters;
  matchCount?: number;
  onClose: () => void;
  onApply: (filters: ShipmentFilters) => void;
}

export function FiltersModal({
  visible,
  initialFilters,
  matchCount,
  onClose,
  onApply,
}: FiltersModalProps) {
  const [draft, setDraft] = useState<ShipmentFilters>(initialFilters);
  const [openField, setOpenField] = useState<OptionField | null>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) setDraft(initialFilters);
  }, [visible, initialFilters]);

  const activeCount = countActiveFilters(draft);

  const handleSelect = (field: OptionField, value: string | null) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleClearAll = () => {
    setDraft(EMPTY_FILTERS);
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };
  const footerText = [
    t(
      activeCount === 1
        ? "shipments.filters.applied"
        : "shipments.filters.applied_plural",
      { count: activeCount },
    ),
    typeof matchCount === "number"
      ? t("shipments.filters.matches", { count: matchCount })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.container, { paddingBottom: rvs(20) + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text size="large" weight="bold">
              {t("shipments.filters.title")}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={rs(24)} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <SelectField
              field="carrier"
              value={draft.carrier}
              active={openField === "carrier"}
              onOpen={setOpenField}
            />

            <SelectField
              field="method"
              value={draft.method}
              active={openField === "method"}
              onOpen={setOpenField}
            />

            <SelectField
              field="paymentStatus"
              value={draft.paymentStatus}
              active={openField === "paymentStatus"}
              onOpen={setOpenField}
            />

            <SelectField
              field="origin"
              value={draft.origin}
              active={openField === "origin"}
              onOpen={setOpenField}
            />

            <SelectField
              field="destination"
              value={draft.destination}
              active={openField === "destination"}
              onOpen={setOpenField}
            />

            <DatePickerField
              label={t("shipments.filters.createdFrom")}
              value={draft.createdFrom}
              maximumDate={draft.createdTo}
              onChange={(date) =>
                setDraft((prev) => ({ ...prev, createdFrom: date }))
              }
              onClear={() =>
                setDraft((prev) => ({ ...prev, createdFrom: null }))
              }
            />

            <DatePickerField
              label={t("shipments.filters.createdTo")}
              value={draft.createdTo}
              minimumDate={draft.createdFrom}
              onChange={(date) =>
                setDraft((prev) => ({
                  ...prev,
                  createdTo: date,
                }))
              }
              onClear={() =>
                setDraft((prev) => ({
                  ...prev,
                  createdTo: null,
                }))
              }
            />
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerMeta}>
              <Text size="small" dimRate="60%">
                {t(
                  activeCount === 1
                    ? "shipments.filters.applied"
                    : "shipments.filters.applied_plural",
                  { count: activeCount },
                )}

                {typeof matchCount === "number"
                  ? ` · ${t("shipments.filters.matches", { count: matchCount })}`
                  : ""}
              </Text>
              {activeCount > 0 && (
                <Pressable
                  onPress={handleClearAll}
                  style={styles.clearAllRow}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={rs(14)} color={Colors.text} />
                  <Text
                    size="small"
                    weight="semibold"
                    style={styles.clearAllText}
                  >
                    {t("shipments.filters.clearAll")}
                  </Text>
                </Pressable>
              )}
            </View>
            <Button
              title={t("shipments.filters.apply")}
              onPress={handleApply}
            />
          </View>
        </Pressable>
      </Pressable>

      {openField && (
        <OptionPickerSheet
          field={openField}
          currentValue={draft[openField]}
          onSelect={handleSelect}
          onClose={() => setOpenField(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(20),
    paddingTop: rvs(18),
    paddingBottom: rvs(14),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  body: {
    paddingHorizontal: rs(20),
  },
  bodyContent: {
    paddingTop: rvs(16),
    paddingBottom: rvs(8),
  },
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
  selectBoxActive: {
    borderColor: Colors.primary,
  },
  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(14),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: rvs(12),
  },
  footerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
  },
  clearAllText: {
    color: Colors.text,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: rs(24),
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    maxHeight: "60%",
    paddingVertical: rvs(12),
  },
  pickerTitle: {
    paddingHorizontal: rs(18),
    paddingBottom: rvs(8),
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(18),
    paddingVertical: rvs(14),
  },
});
