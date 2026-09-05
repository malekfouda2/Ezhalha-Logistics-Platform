import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SaudiRiyal } from "lucide-react-native";
import Toast from "react-native-toast-message";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { SectionLabel } from "@/components/ui/InfoCard";
import { UnitToggle } from "@/components/sections/createShipment/express/UnitToggle";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { countryFlagEmoji } from "@/utils/countryFlag";

type ShipmentType = "express" | "local" | "freight";

interface RouteValue {
  code: string;
  name: string;
  city: string;
}

const TYPE_CONFIG: Record<
  ShipmentType,
  { baseRate: number; perKg: number; minDays: number; maxDays: number; bookable: boolean }
> = {
  express: { baseRate: 120, perKg: 42, minDays: 2, maxDays: 3, bookable: true },
  local: { baseRate: 25, perKg: 8, minDays: 1, maxDays: 1, bookable: true },
  freight: { baseRate: 350, perKg: 6, minDays: 7, maxDays: 12, bookable: false },
};

export default function QuickQuoteScreen() {
  const { t } = useTranslation();

  const [type, setType] = useState<ShipmentType>("express");
  const [origin, setOrigin] = useState<RouteValue>({ code: "SA", name: "Saudi Arabia", city: "Riyadh" });
  const [destination, setDestination] = useState<RouteValue>({ code: "GB", name: "United Kingdom", city: "London" });
  const [weightText, setWeightText] = useState("3.0");
  const [piecesText, setPiecesText] = useState("1");

  const weight = Math.max(0.1, parseFloat(weightText) || 0.1);
  const pieces = Math.max(1, Math.round(parseFloat(piecesText) || 1));

  const config = TYPE_CONFIG[type];

  const estimate = useMemo(() => {
    const subtotal = config.baseRate + weight * config.perKg + (pieces - 1) * config.baseRate * 0.15;
    const fedexTotal = Math.round(subtotal * 1.08 * 1.15);
    const dhlTotal = Math.round(subtotal * 1.0 * 1.15);
    return { fedexTotal, dhlTotal };
  }, [config, weight, pieces]);

  const handleBook = () => {
    if (!config.bookable) {
      Toast.show({
        type: "info",
        text1: t("quickQuote.title"),
        text2: t("quickQuote.freightUnavailable"),
      });
      return;
    }
    router.push(type === "local" ? "/createShipment/local" : "/createShipment/express");
  };

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            <Button title={t("quickQuote.book")} onPress={handleBook} />
          </View>
        }
      >
        <ScreenHeader title={t("quickQuote.title")} subtitle={t("quickQuote.subtitle")} />

        <UnitToggle
          options={[
            { value: "express", label: t("quickQuote.types.express") },
            { value: "local", label: t("quickQuote.types.local") },
            { value: "freight", label: t("quickQuote.types.freight") },
          ]}
          value={type}
          onChange={(value) => setType(value as ShipmentType)}
        />

        <View style={styles.gap} />

        <SectionLabel>{t("quickQuote.route")}</SectionLabel>
        <RouteField
          value={origin}
          onChange={setOrigin}
          placeholder={t("quickQuote.originPlaceholder")}
          pickerTitle={t("quickQuote.selectCountry")}
        />
        <RouteField
          value={destination}
          onChange={setDestination}
          placeholder={t("quickQuote.destinationPlaceholder")}
          pickerTitle={t("quickQuote.selectCountry")}
        />

        <SectionLabel>{t("quickQuote.shipment")}</SectionLabel>
        <View style={styles.row}>
          <View style={styles.half}>
            <Input
              value={weightText}
              onChangeText={setWeightText}
              placeholder={t("quickQuote.weightPlaceholder")}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <Input
              value={piecesText}
              onChangeText={setPiecesText}
              placeholder={t("quickQuote.piecesPlaceholder")}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <SectionLabel>{t("quickQuote.estimated")}</SectionLabel>
        <RateEstimateCard
          carrierCode="FedEx"
          carrierColor="#4D148C"
          serviceName={t("quickQuote.carriers.fedexPriority")}
          days={t(config.minDays === config.maxDays ? "quickQuote.days_one" : "quickQuote.days_other", {
            count: config.maxDays,
          })}
          price={estimate.fedexTotal}
          inclVat={t("quickQuote.inclVat")}
        />
        <RateEstimateCard
          carrierCode="DHL"
          carrierColor="#FFCC00"
          carrierTextColor="#D40511"
          serviceName={t("quickQuote.carriers.dhlWorldwide")}
          days={t(config.minDays === config.maxDays ? "quickQuote.days_one" : "quickQuote.days_other", {
            count: config.minDays,
          })}
          price={estimate.dhlTotal}
          inclVat={t("quickQuote.inclVat")}
        />

        <View style={styles.notice}>
          <Ionicons name="time-outline" size={rs(16)} color={Colors.textSecondary} />
          <Text size="small" dimRate="60%" style={styles.noticeText}>
            {t("quickQuote.notice")}
          </Text>
        </View>
      </KeyboardAwareScreen>
    </View>
  );
}

function RouteField({
  value,
  onChange,
  placeholder,
  pickerTitle,
}: {
  value: RouteValue;
  onChange: (value: RouteValue) => void;
  placeholder: string;
  pickerTitle: string;
}) {
  return (
    <View style={styles.routeField}>
      <Text size="medium" style={styles.routeText}>
        {countryFlagEmoji(value.code)} {value.name}
        {value.city ? ` · ${value.city}` : ""}
      </Text>
      <CountrySelect
        value={value.code}
        onChange={(country) => onChange({ ...value, code: country.code, name: country.name })}
        placeholder={placeholder}
        title={pickerTitle}
      />
    </View>
  );
}

function RateEstimateCard({
  carrierCode,
  carrierColor,
  carrierTextColor = Colors.white,
  serviceName,
  days,
  price,
  inclVat,
}: {
  carrierCode: string;
  carrierColor: string;
  carrierTextColor?: string;
  serviceName: string;
  days: string;
  price: number;
  inclVat: string;
}) {
  return (
    <View style={styles.rateCard}>
      <View style={[styles.rateLogo, { backgroundColor: carrierColor }]}>
        <Text size="xs" weight="bold" style={{ color: carrierTextColor }}>
          {carrierCode}
        </Text>
      </View>

      <View style={styles.rateInfo}>
        <Text size="medium" weight="bold">
          {serviceName}
        </Text>
        <Text size="xs" weight="semibold" dimRate="55%" style={styles.rateDays}>
          {days}
        </Text>
      </View>

      <View style={styles.ratePriceBlock}>
        <View style={styles.ratePriceRow}>
          <SaudiRiyal size={rs(18)} color={Colors.text} />
          <Text size="large" weight="bold" style={styles.ratePrice}>
            {price}
          </Text>
        </View>
        <Text size="xs" dimRate="55%">
          {inclVat}
        </Text>
      </View>
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
    paddingTop: rvs(8),
    paddingBottom: rvs(20),
  },
  footer: {
    paddingHorizontal: rs(16),
    paddingBottom: rvs(20),
    paddingTop: rvs(8),
    backgroundColor: Colors.background,
  },
  gap: {
    height: rvs(16),
  },
  row: {
    flexDirection: "row",
    gap: rs(14),
  },
  half: {
    flex: 1,
  },
  routeField: {
    marginBottom: rvs(6),
  },
  routeText: {
    marginBottom: rvs(6),
  },
  rateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginBottom: rvs(12),
    gap: rs(12),
  },
  rateLogo: {
    width: rs(52),
    height: rs(40),
    borderRadius: rs(10),
    alignItems: "center",
    justifyContent: "center",
  },
  rateInfo: {
    flex: 1,
  },
  rateDays: {
    marginTop: rvs(2),
  },
  ratePriceBlock: {
    alignItems: "flex-end",
  },
  ratePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(2),
  },
  ratePrice: {
    color: Colors.text,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    padding: rs(14),
    marginTop: rvs(4),
  },
  noticeText: {
    flex: 1,
  },
});
