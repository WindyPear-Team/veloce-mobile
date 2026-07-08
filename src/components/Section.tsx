import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  title: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  body: {
    gap: 10,
  },
});

