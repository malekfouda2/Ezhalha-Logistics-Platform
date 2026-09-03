// app/saved-cards.tsx
import { View, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { BackButton } from "@/components/ui/BackButton";
import { RefreshableScreen } from "@/components/ui/RefreshableScreen";
import InfoBox from "@/components/ui/InfoBox";
import { DashedActionButton } from "@/components/ui/DashedActionButton";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { SavedCard, setDefaultSavedCard, deleteSavedCard } from "@/lib/services/payments";

function CardRow({
  card,
  onSetDefault,
  onDelete,
}: {
  card: SavedCard;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const expiry =
    card.expMonth && card.expYear
      ? t("invoices.savedCards.expires", {
          date: `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`,
        })
      : null;

  return (
    <Pressable onPress={onSetDefault} style={styles.row}>
      <View style={styles.brandChip}>
        <Text size="xs" weight="bold" style={styles.brandChipText}>
          {(card.brand ?? "CARD").slice(0, 4).toUpperCase()}
        </Text>
      </View>

      <View style={styles.info}>
        <Text size="medium" weight="bold">
          •••• {card.lastFour}
        </Text>
        <Text size="xs" weight="semibold" dimRate="55%" style={styles.meta}>
          {card.isDefault
            ? expiry
              ? `${t("invoices.savedCards.default")} · ${expiry}`
              : t("invoices.savedCards.default")
            : expiry}
        </Text>
      </View>

      <View style={[styles.radioOuter, card.isDefault && styles.radioOuterSelected]}>
        {card.isDefault ? <View style={styles.radioInner} /> : null}
      </View>

      <Pressable onPress={onDelete} hitSlop={10} style={styles.deleteButton}>
        <Feather name="trash-2" size={rs(16)} color={Colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

export default function SavedCardsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: cards, isLoading } = useQuery<SavedCard[]>({
    queryKey: ["/api/client/payments/tap/saved-cards"],
  });

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultSavedCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/payments/tap/saved-cards"] });
    },
    onError: (error: Error) => {
      Toast.show({
        type: "error",
        text1: t("invoices.savedCards.setDefaultErrorTitle"),
        text2: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/payments/tap/saved-cards"] });
    },
    onError: (error: Error) => {
      Toast.show({
        type: "error",
        text1: t("invoices.savedCards.removeErrorTitle"),
        text2: error.message,
      });
    },
  });

  const confirmDelete = (card: SavedCard) => {
    Alert.alert(
      t("invoices.savedCards.removeConfirmTitle"),
      t("invoices.savedCards.removeConfirmMessage", { lastFour: card.lastFour }),
      [
        { text: t("invoices.savedCards.cancel"), style: "cancel" },
        {
          text: t("invoices.savedCards.remove"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(card.id),
        },
      ],
    );
  };

  const handleAddCard = () => {
    Toast.show({
      type: "info",
      text1: t("invoices.savedCards.addCardInfoTitle"),
      text2: t("invoices.savedCards.addCardInfoMessage"),
    });
  };

  return (
    <View style={styles.screen}>
      <RefreshableScreen contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton />
          <View style={styles.headerTitleBlock}>
            <Text size="medium" weight="bold">
              {t("invoices.savedCards.title")}
            </Text>
            <Text size="small" weight="semibold" dimRate="60%">
              {t("invoices.savedCards.subtitle")}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : (
          <>
            {(cards ?? []).map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onSetDefault={() => !card.isDefault && setDefaultMutation.mutate(card.id)}
                onDelete={() => confirmDelete(card)}
              />
            ))}

            {(cards ?? []).length === 0 && (
              <Text size="small" dimRate="60%" style={styles.emptyText}>
                {t("invoices.savedCards.empty")}
              </Text>
            )}

            <DashedActionButton
              icon="plus"
              label={t("invoices.savedCards.addCard")}
              onPress={handleAddCard}
            />

            <InfoBox text={t("invoices.savedCards.notice")} />
          </>
        )}
      </RefreshableScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
    paddingBottom: rvs(24),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rvs(20),
  },
  headerTitleBlock: {
    flex: 1,
    paddingStart: rs(10),
  },
  loading: {
    marginTop: rvs(60),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingHorizontal: rs(14),
    paddingVertical: rvs(14),
    marginBottom: rvs(12),
    gap: rs(12),
  },
  brandChip: {
    width: rs(46),
    height: rs(32),
    borderRadius: rs(7),
    backgroundColor: "navy",
    alignItems: "center",
    justifyContent: "center",
  },
  brandChipText: {
    color: Colors.white,
  },
  info: {
    flex: 1,
  },
  meta: {
    marginTop: rvs(2),
  },
  radioOuter: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: rs(11),
    height: rs(11),
    borderRadius: rs(6),
    backgroundColor: Colors.primary,
  },
  deleteButton: {
    paddingStart: rs(4),
  },
  emptyText: {
    paddingVertical: rvs(20),
    textAlign: "center",
  },
});
