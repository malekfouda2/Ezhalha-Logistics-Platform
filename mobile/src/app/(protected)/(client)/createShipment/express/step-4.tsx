// app/create-shipment/express/step-4.tsx

import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import { DashedActionButton } from "@/components/sections/createShipment/express/DashedActionButton";
import { PackageCard } from "@/components/sections/createShipment/express/PackageCard";
import { WeightSummaryCard } from "@/components/sections/createShipment/express/WeightSummaryCard";

interface PackageForm {
  id: string;
  weight: string;
  length: string;
  width: string;
  height: string;
}

const VOLUMETRIC_DIVISOR = 5000;

export default function PackageDetailsScreen() {
  const router = useRouter();

  const [packages, setPackages] = useState<PackageForm[]>([
    { id: "1", weight: "4.5", length: "40", width: "30", height: "20" },
    { id: "2", weight: "2.0", length: "25", width: "20", height: "15" },
  ]);

  const updatePackage = (
    id: string,
    field: keyof Omit<PackageForm, "id">,
    value: string
  ) => {
    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.id === id ? { ...pkg, [field]: value } : pkg
      )
    );
  };

  const addPackage = () => {
    setPackages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        weight: "",
        length: "",
        width: "",
        height: "",
      },
    ]);
  };

  const removePackage = (id: string) => {
    setPackages((prev) => prev.filter((pkg) => pkg.id !== id));
  };

  const { actualWeight, volumetricWeight, chargeableWeight } =
    useMemo(() => {
      let actual = 0;
      let volumetric = 0;

      packages.forEach((pkg) => {
        const w = parseFloat(pkg.weight) || 0;
        const l = parseFloat(pkg.length) || 0;
        const wd = parseFloat(pkg.width) || 0;
        const h = parseFloat(pkg.height) || 0;

        actual += w;
        volumetric += (l * wd * h) / VOLUMETRIC_DIVISOR;
      });

      return {
        actualWeight: actual,
        volumetricWeight: volumetric,
        chargeableWeight: Math.max(actual, volumetric),
      };
    }, [packages]);

  const handleGetRates = () => {
    router.push("/createShipment/express/step-5");
  };

  return (
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <ShipmentStepHeader
            step={4}
            totalSteps={8}
            title="Package Details"
            subtitle="Weight and dimensions"
            onBack={() => router.back()}
          />

          {packages.map((pkg, index) => (
            <PackageCard
              key={pkg.id}
              index={index + 1}
              weight={pkg.weight}
              length={pkg.length}
              width={pkg.width}
              height={pkg.height}
              removable={packages.length > 1}
              onChangeWeight={(v) => updatePackage(pkg.id, "weight", v)}
              onChangeLength={(v) => updatePackage(pkg.id, "length", v)}
              onChangeWidth={(v) => updatePackage(pkg.id, "width", v)}
              onChangeHeight={(v) => updatePackage(pkg.id, "height", v)}
              onRemove={() => removePackage(pkg.id)}
            />
          ))}

          <View style={styles.actionsGap} />

          <DashedActionButton
            icon="plus"
            label="Add another package"
            onPress={addPackage}
          />

          <DashedActionButton
            icon="upload"
            label="Scan a document to fill this in"
            onPress={() => {}}
          />

          <View style={styles.summaryGap} />

          <WeightSummaryCard
            actualWeight={actualWeight}
            volumetricWeight={volumetricWeight}
            chargeableWeight={chargeableWeight}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Get rates" onPress={handleGetRates} />
        </View>
      </View>
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

  scrollContent: {
    paddingHorizontal: rs(16),
    paddingTop: rvs(16),
  },

  actionsGap: {
    height: rvs(4),
  },

  summaryGap: {
    height: rvs(10),
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
});