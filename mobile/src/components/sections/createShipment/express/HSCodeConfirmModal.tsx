// components/sections/createShipment/express/HSCodeConfirmModal.tsx

import React, { useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export interface HSCodeOption {
  code: string;
  description: string;
}

interface HSCodeConfirmModalProps {
  visible: boolean;
  itemName: string;
  options: HSCodeOption[];
  defaultCode?: string;
  onConfirm: (code: string) => void;
  onClose: () => void;
}

export const HSCodeConfirmModal = ({
  visible,
  itemName,
  options,
  defaultCode,
  onConfirm,
  onClose,
}: HSCodeConfirmModalProps) => {
  const [selectedCode, setSelectedCode] = useState(
    defaultCode ?? options[0]?.code
  );

  useEffect(() => {
    if (visible) {
      setSelectedCode(defaultCode ?? options[0]?.code);
    }
  }, [visible, defaultCode, options]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <SafeAreaView edges={["bottom"]} style={styles.sheetContainer}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text size="xl" weight="bold" style={styles.title}>
            Confirm the HS code
          </Text>

          <Text size="medium" style={styles.subtitle}>
            {itemName} — pick the code customs should see.
          </Text>

          {options.map((option) => {
            const selected = option.code === selectedCode;

            return (
              <Pressable
                key={option.code}
                onPress={() => setSelectedCode(option.code)}
                style={styles.option}
              >
                <View style={styles.optionText}>
                  <Text
                    size="large"
                    weight="bold"
                    style={styles.optionCode}
                  >
                    {option.code}
                  </Text>
                  <Text size="small" style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>

                <View
                  style={[
                    styles.radioOuter,
                    selected && styles.radioOuterSelected,
                  ]}
                >
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}

          <View style={styles.footer}>
            <Button
              title="Confirm code"
              onPress={() => onConfirm(selectedCode)}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 20, 30, 0.4)",
  },

  sheetContainer: {
    backgroundColor: Colors.white,
  },

  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: rs(28),
    borderTopRightRadius: rs(28),

    paddingHorizontal: rs(20),
    paddingTop: rvs(12),
  },

  handle: {
    alignSelf: "center",
    width: rs(40),
    height: rvs(5),
    borderRadius: rs(5),
    backgroundColor: Colors.border,
    marginBottom: rvs(18),
  },

  title: {
    color: Colors.text,
    marginBottom: rvs(8),
  },

  subtitle: {
    color: "#687994",
    marginBottom: rvs(20),
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: Colors.background,
    borderRadius: rs(18),

    paddingHorizontal: rs(16),
    paddingVertical: rvs(16),
    marginBottom: rvs(14),
  },

  optionText: {
    flex: 1,
    marginEnd: rs(10),
  },

  optionCode: {
    color: Colors.text,
    marginBottom: rvs(4),
  },

  optionDescription: {
    color: "#687994",
  },

  radioOuter: {
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: Colors.primary,
  },

  radioInner: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },

  footer: {
    paddingTop: rvs(6),
    paddingBottom: rvs(10),
  },
});