import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../theme/colors";

export interface ChoiceItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface ChoiceListProps {
  items: ChoiceItem[];
  selectedID?: string;
  emptyText?: string;
  onSelect: (id: string) => void;
}

export function ChoiceList({ items, selectedID, emptyText = "暂无可选项", onSelect }: ChoiceListProps) {
  if (items.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const selected = item.id === selectedID;
        return (
          <Pressable key={item.id} onPress={() => onSelect(item.id)} style={({ pressed }) => [styles.item, selected && styles.selected, pressed && styles.pressed]}>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
              {item.subtitle ? <Text numberOfLines={2} style={styles.subtitle}>{item.subtitle}</Text> : null}
            </View>
            {selected ? <Check size={18} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  item: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  pressed: {
    opacity: 0.82,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  empty: {
    paddingVertical: 16,
    textAlign: "center",
    color: colors.muted,
  },
});

