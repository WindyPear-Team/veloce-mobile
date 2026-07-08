import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors } from "../theme/colors";

interface FieldProps extends TextInputProps {
  label: string;
  right?: ReactNode;
}

export function Field({ label, right, style, ...props }: FieldProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {right}
      </View>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
});

