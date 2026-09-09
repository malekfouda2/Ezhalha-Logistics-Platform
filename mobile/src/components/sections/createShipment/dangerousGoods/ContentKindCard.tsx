import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Feather,
  FontAwesome,
  MaterialIcons,
  Fontisto,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";

export type ContentKindIconName = React.ComponentProps<
  | typeof Feather
  | typeof FontAwesome
  | typeof MaterialIcons
  | typeof Fontisto
  | typeof Ionicons
  | typeof MaterialCommunityIcons
>["name"];

interface ContentKindCardProps {
  icon: ContentKindIconName;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

// The data only carries a bare icon name, not which set it came from, so pick whichever
// library actually defines it — checked in a fixed order so a name that happens to exist in
// more than one set still resolves predictably.
function renderContentKindIcon(name: ContentKindIconName, size: number, color: string) {
  if (name in Feather.glyphMap) {
    return <Feather name={name as React.ComponentProps<typeof Feather>["name"]} size={size} color={color} />;
  }
  if (name in FontAwesome.glyphMap) {
    return <FontAwesome name={name as React.ComponentProps<typeof FontAwesome>["name"]} size={size} color={color} />;
  }
  if (name in MaterialIcons.glyphMap) {
    return <MaterialIcons name={name as React.ComponentProps<typeof MaterialIcons>["name"]} size={size} color={color} />;
  }
  if (name in Fontisto.glyphMap) {
    return <Fontisto name={name as React.ComponentProps<typeof Fontisto>["name"]} size={size} color={color} />;
  }
  if (name in Ionicons.glyphMap) {
    return <Ionicons name={name as React.ComponentProps<typeof Ionicons>["name"]} size={size} color={color} />;
  }
  return (
    <MaterialCommunityIcons
      name={name as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
      size={size}
      color={color}
    />
  );
}

export const ContentKindCard = ({
  icon,
  title,
  description,
  selected,
  disabled = false,
  onPress,
}: ContentKindCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        selected && styles.containerSelected,
        disabled && styles.containerDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.iconWrapper}>
        {renderContentKindIcon(icon, rs(16), "#B8760A")}
      </View>

      <View style={styles.textContainer}>
        <Text size="medium" weight="bold" style={styles.title}>
          {title}
        </Text>
        <Text size="small" style={styles.description}>
          {description}
        </Text>
      </View>

      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: rvs(50),

    backgroundColor: Colors.white,

    borderRadius: rs(22),

    paddingHorizontal: rs(15),
    paddingVertical: rvs(15),

    flexDirection: "row",
    alignItems: "center",

    marginBottom: rvs(10),

    borderWidth: 1.5,
    borderColor: "transparent",

    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,

    elevation: 1,
  },

  containerSelected: {
    borderColor: Colors.primary,
  },

  containerDisabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.85,
  },

  iconWrapper: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(10),
    backgroundColor: "#FDF0D8",
    alignItems: "center",
    justifyContent: "center",
    marginEnd: rs(12),
    flexShrink: 0,
  },

  textContainer: {
    flex: 1,
    paddingEnd: rs(12),
  },

  title: {
    color: Colors.text,
  },

  description: {
    color: "#687994",
  },

  radioOuter: {
    width: rs(25),
    height: rs(25),

    borderRadius: 50,

    borderWidth: 2,
    borderColor: "#E9EDF2",

    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  radioOuterSelected: {
    borderColor: Colors.primary,
  },

  radioInner: {
    width: rs(12),
    height: rs(12),

    borderRadius: 50,

    backgroundColor: Colors.primary,
  },
});
