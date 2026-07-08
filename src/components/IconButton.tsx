import type { ComponentType } from "react";
import { Pressable, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

interface IconButtonProps {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  color?: string;
  onPress: () => void;
}

export function IconButton({ icon: Icon, label, color = colors.text, onPress }: IconButtonProps) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon size={20} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});

