import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { KeyboardAwareScreen } from "@/components/ui/KeyboardAwareScreen";
import { SectionLabel } from "@/components/ui/InfoCard";
import { RateOptionCard } from "@/components/sections/createShipment/RateOptionCard";
import { ScreenHeader } from "@/components/sections/profile/ScreenHeader";
import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { rs, rvs } from "@/utils/responsive";
import { countryFlagEmoji } from "@/utils/countryFlag";
import { ApiError } from "@/api/client";
import { fetchQuickQuote } from "@/lib/services/quickQuote";

interface RouteValue {
  code: string;
  name: string;
  city: string;
}

export default function QuickQuoteScreen() {
  const { t } = useTranslation();

  const [origin, setOrigin] = useState<RouteValue>({
    code: "SA",
    name: "Saudi Arabia",
    city: "",
  });
  const [destination, setDestination] = useState<RouteValue>({
    code: "GB",
    name: "United Kingdom",
    city: "",
  });
  const [weightText, setWeightText] = useState("");
  const [lengthText, setLengthText] = useState("");
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [piecesText, setPiecesText] = useState("");

  const weight = Number(weightText) || 0;
  const canQuote = Boolean(origin.code && destination.code && weight > 0);

  const quote = useMutation({
    mutationFn: fetchQuickQuote,
  });

  const mutate = quote.mutate;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!canQuote) return;
    timer.current = setTimeout(() => {
      mutate({
        origin: { countryCode: origin.code, city: origin.city || undefined },
        destination: {
          countryCode: destination.code,
          city: destination.city || undefined,
        },
        weightKg: weight,
        length: Number(lengthText) || undefined,
        width: Number(widthText) || undefined,
        height: Number(heightText) || undefined,
        pieces: Math.max(1, Number(piecesText) || 1),
      });
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canQuote,
    origin,
    destination,
    weight,
    lengthText,
    widthText,
    heightText,
    piecesText,
  ]);

  const data = quote.data;
  const showResults = canQuote && Boolean(data);
  const noneAvailable =
    showResults && data
      ? !data.available.local && !data.available.ddp && !data.available.express
      : false;

  const days = (count: number | null) =>
    count == null
      ? ""
      : t(count === 1 ? "quickQuote.days_one" : "quickQuote.days_other", {
          count,
        });

  return (
    <View style={styles.screen}>
      <KeyboardAwareScreen contentContainerStyle={styles.content}>
        <ScreenHeader
          title={t("quickQuote.title")}
          subtitle={t("quickQuote.subtitle")}
        />

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
        <View style={styles.grid}>
          <GridField
            label={t("quickQuote.weightPlaceholder")}
            value={weightText}
            onChangeText={setWeightText}
            keyboardType="decimal-pad"
          />

          <GridField
            label={t("quickQuote.lengthPlaceholder")}
            value={lengthText}
            onChangeText={setLengthText}
            keyboardType="decimal-pad"
          />
          <GridField
            label={t("quickQuote.widthPlaceholder")}
            value={widthText}
            onChangeText={setWidthText}
            keyboardType="decimal-pad"
          />
          <GridField
            label={t("quickQuote.heightPlaceholder")}
            value={heightText}
            onChangeText={setHeightText}
            keyboardType="decimal-pad"
          />
          <GridField
            label={t("quickQuote.piecesPlaceholder")}
            value={piecesText}
            onChangeText={setPiecesText}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.gap} />

        {!canQuote && (
          <Text size="small" dimRate="60%" style={styles.centered}>
            {t("quickQuote.enterDetails")}
          </Text>
        )}

        {quote.isPending && canQuote && (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}

        {quote.isError && canQuote && (
          <View style={styles.notice}>
            <Ionicons
              name="alert-circle-outline"
              size={rs(16)}
              color={Colors.error}
            />
            <Text size="small" style={styles.noticeText}>
              {quote.error instanceof ApiError
                ? quote.error.message
                : t("quickQuote.quoteError")}
            </Text>
          </View>
        )}

        {noneAvailable && (
          <Text size="small" dimRate="60%" style={styles.centered}>
            {t("quickQuote.noRates")}
          </Text>
        )}

        {showResults && data && data.available.express && (
          <QuoteSection title={t("quickQuote.sections.express")}>
            {data.express.map((q, i) => (
              <RateOptionCard
                key={`${q.carrierCode}-${q.serviceType || i}`}
                carrierCode={q.carrierCode}
                carrierColor={Colors.primary}
                serviceName={q.serviceName || q.carrierName}
                deliveryLabel={days(q.transitDays)}
                price={String(q.clientTotal)}
                badge={i === 0 ? "cheapest" : undefined}
              />
            ))}
            <Button
              title={t("quickQuote.continueTo.express")}
              onPress={() => router.push("/createShipment/express")}
            />
          </QuoteSection>
        )}

        {showResults && data && data.available.local && (
          <QuoteSection title={t("quickQuote.sections.local")}>
            {data.local.map((q, i) => (
              <RateOptionCard
                key={q.carrierCode}
                carrierCode={q.carrierCode}
                carrierColor={Colors.primary}
                serviceName={q.carrierName}
                deliveryLabel={days(q.transitDays)}
                price={String(q.clientTotal)}
                badge={i === 0 ? "cheapest" : undefined}
              />
            ))}
            <Button
              title={t("quickQuote.continueTo.local")}
              onPress={() => router.push("/createShipment/local")}
            />
          </QuoteSection>
        )}

        {showResults && data && data.available.ddp && (
          <QuoteSection title={t("quickQuote.sections.ddp")}>
            {data.ddp.map((q) => (
              <RateOptionCard
                key={q.transportMethod}
                carrierCode={q.transportMethod.slice(0, 3).toUpperCase()}
                carrierColor={Colors.primary}
                serviceName={t(
                  `quickQuote.transportMethods.${q.transportMethod}`,
                )}
                deliveryLabel={days(q.transitDays)}
                price={String(q.clientTotal)}
              />
            ))}
            <Button
              title={t("quickQuote.continueTo.ddp")}
              onPress={() => router.push("/createShipment/doorToDoor")}
            />
          </QuoteSection>
        )}

        {showResults && !noneAvailable && (
          <View style={styles.notice}>
            <Ionicons
              name="time-outline"
              size={rs(16)}
              color={Colors.textSecondary}
            />
            <Text size="small" dimRate="60%" style={styles.noticeText}>
              {t("quickQuote.notice")}
            </Text>
          </View>
        )}
      </KeyboardAwareScreen>
    </View>
  );
}

function QuoteSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </View>
  );
}

function GridField({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType: "decimal-pad" | "number-pad";
}) {
  return (
    <View style={styles.gridItem}>
      <Text size="xs" weight="bold" style={styles.gridLabel}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={Colors.placeholder}
        style={styles.gridInput}
      />
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
        onChange={(country) =>
          onChange({ ...value, code: country.code, name: country.name })
        }
        placeholder={placeholder}
        title={pickerTitle}
      />
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
  gap: {
    height: rvs(16),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(10),
  },
  gridItem: {
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: rs(16),
    paddingHorizontal: rs(10),
    paddingTop: rvs(10),
  },
  gridLabel: {
    color: Colors.secondary,
    letterSpacing: 1,
  },
  gridInput: {
    width: "100%",
    height: rvs(40),
    paddingHorizontal: 0,
    textAlign: "center",
    fontSize: Typography.size.large,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text,
  },
  routeField: {
    marginBottom: rvs(6),
  },
  routeText: {
    marginBottom: rvs(6),
  },
  section: {
    marginBottom: rvs(8),
  },
  centered: {
    textAlign: "center",
    paddingVertical: rvs(24),
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
