import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

interface AppButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

export function AppButton({ children, variant = "primary", disabled, loading, style, onPress }: AppButtonProps) {
  const textStyle = variant === "primary"
    ? styles.primaryText
    : variant === "danger"
      ? styles.dangerText
      : variant === "ghost"
        ? styles.ghostText
        : styles.secondaryText;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#fff" : colors.primary} /> : <Text style={[styles.text, textStyle]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.8,
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
  },
  primaryText: {
    color: "#fff",
  },
  secondaryText: {
    color: colors.text,
  },
  dangerText: {
    color: "#fff",
  },
  ghostText: {
    color: colors.primary,
  },
});
