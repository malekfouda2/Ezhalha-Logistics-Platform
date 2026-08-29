// app/create-shipment/express/step-6.tsx

import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { DashedActionButton } from "@/components/sections/createShipment/express/DashedActionButton";

import { ShipmentStepHeader } from "@/components/sections/createShipment/ShipmentStepHeader";
import {
  HSConfidence,
  CustomsItemCard,
} from "@/components/sections/createShipment/express/CustomsItemCard";
import { CustomsSummaryCard } from "@/components/sections/createShipment/express/CustomsSummaryCard";
import {
  HSCodeOption,
  HSCodeConfirmModal,
} from "@/components/sections/createShipment/express/HSCodeConfirmModal";
import ShipmentFooter from "@/components/sections/createShipment/ShipmentFooter";

interface CustomsItem {
  id: string;
  name: string;
  category: string;
  material: string;
  countryFlag: string;
  countryName: string;
  totalPrice: string;
  quantity: number;
  unitPrice: string;
  hsCode: string;
  confidence: HSConfidence;
  hsOptions: HSCodeOption[];
}

const CUSTOMS_ITEMS: CustomsItem[] = [
  {
    id: "1",
    name: "Cotton T-Shirts",
    category: "Apparel",
    material: "100% cotton",
    countryFlag: "🇮🇳",
    countryName: "India",
    totalPrice: "450.00",
    quantity: 30,
    unitPrice: "15.00",
    hsCode: "6109.10",
    confidence: "high",
    hsOptions: [
      {
        code: "6109.10",
        description: "T-shirts, of cotton, knitted or crocheted",
      },
    ],
  },
  {
    id: "2",
    name: "Leather Wallets",
    category: "Accessories",
    material: "Genuine leather",
    countryFlag: "🇮🇹",
    countryName: "Italy",
    totalPrice: "600.00",
    quantity: 10,
    unitPrice: "60.00",
    hsCode: "4202.31",
    confidence: "review",
    hsOptions: [
      {
        code: "4202.31",
        description: "Articles of leather, pocket-size",
      },
      {
        code: "4202.32",
        description: "With outer surface of plastic sheeting",
      },
      {
        code: "4202.39",
        description: "Other similar articles",
      },
    ],
  },
];

export default function CustomsDetailsScreen() {
  const router = useRouter();

  const [items, setItems] = useState(CUSTOMS_ITEMS);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const activeItem = items.find((item) => item.id === activeItemId);

  const totalPrice = items
    .reduce((sum, item) => sum + parseFloat(item.totalPrice), 0)
    .toFixed(2);

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleConfirmHSCode = (code: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === activeItemId
          ? { ...item, hsCode: code, confidence: "high" }
          : item,
      ),
    );
    setActiveItemId(null);
  };

  const handleContinue = () => {
    router.push("/createShipment/express/step-7");
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <ShipmentStepHeader
            step={6}
            totalSteps={8}
            title="Customs Details"
            subtitle="International only"
            onBack={() => router.back()}
          />

          <DashedActionButton
            icon="upload"
            label="Scan an invoice to fill this in"
            onPress={() => {}}
          />

          {items.map((item) => (
            <CustomsItemCard
              key={item.id}
              name={item.name}
              category={item.category}
              material={item.material}
              countryFlag={item.countryFlag}
              countryName={item.countryName}
              totalPrice={item.totalPrice}
              quantity={item.quantity}
              unitPrice={item.unitPrice}
              hsCode={item.hsCode}
              confidence={item.confidence}
              onPressHSCode={() => setActiveItemId(item.id)}
            />
          ))}

          <DashedActionButton icon="plus" label="Add item" onPress={() => {}} />

          <View style={styles.summaryGap} />

          <CustomsSummaryCard
            itemCount={items.length}
            unitCount={totalUnits}
            totalPrice={totalPrice}
            declaredValue="280.00"
          />
        </ScrollView>

        <ShipmentFooter onPress={handleContinue} />
      </View>

      <HSCodeConfirmModal
        visible={!!activeItem}
        itemName={activeItem?.name ?? ""}
        options={activeItem?.hsOptions ?? []}
        defaultCode={activeItem?.hsCode}
        onConfirm={handleConfirmHSCode}
        onClose={() => setActiveItemId(null)}
      />
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

  summaryGap: {
    height: rvs(6),
  },

  footer: {
    paddingHorizontal: rs(20),
    paddingTop: rvs(10),
    paddingBottom: rvs(10),
    backgroundColor: Colors.background,
  },
});
