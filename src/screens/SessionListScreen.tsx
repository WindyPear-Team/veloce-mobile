import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MoreHorizontal, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createSession, deleteSession, getSessions, saveSession, selectedSessionKey, titleFromMessages } from "../api/chat";
import { AppButton } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { colors } from "../theme/colors";
import type { ChatSession, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Sessions">;

export function SessionListScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeID, setActiveID] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [items, stored] = await Promise.all([getSessions(), AsyncStorage.getItem(selectedSessionKey)]);
      setSessions(items);
      setActiveID(stored || items[0]?.id || "");
    } catch (err) {
      Alert.alert("加载失败", err instanceof Error ? err.message : "无法读取会话。");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const select = async (sessionID: string) => {
    await AsyncStorage.setItem(selectedSessionKey, sessionID);
    navigation.navigate("Chat", { sessionID });
  };

  const create = async () => {
    const session = createSession();
    const saved = await saveSession(session);
    await AsyncStorage.setItem(selectedSessionKey, saved.id);
    navigation.navigate("Chat", { sessionID: saved.id });
  };

  const remove = async (sessionID: string) => {
    try {
      await deleteSession(sessionID);
      const next = sessions.filter((session) => session.id !== sessionID);
      setSessions(next);
      if (activeID === sessionID) {
        await AsyncStorage.setItem(selectedSessionKey, next[0]?.id || "");
      }
    } catch (err) {
      Alert.alert("删除失败", err instanceof Error ? err.message : "无法删除会话。");
    }
  };

  const showActions = (session: ChatSession) => {
    Alert.alert(session.title || "未命名会话", "选择操作", [
      { text: "取消", style: "cancel" },
      { text: "会话设置", onPress: () => navigation.navigate("SessionSettings", { sessionID: session.id }) },
      { text: "删除", style: "destructive", onPress: () => void remove(session.id) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <AppButton onPress={create} style={styles.newButton}>
        新建会话
      </AppButton>
      {loading && sessions.length === 0 ? <Text style={styles.empty}>正在加载...</Text> : null}
      {!loading && sessions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Plus size={24} color={colors.muted} />
          <Text style={styles.empty}>还没有会话</Text>
        </View>
      ) : null}
      {sessions.map((session) => {
        const selected = session.id === activeID;
        return (
          <Pressable
            key={session.id}
            onPress={() => void select(session.id)}
            onLongPress={() => showActions(session)}
            style={[styles.item, selected && styles.selected]}
          >
            <View style={styles.itemCopy}>
              <Text numberOfLines={1} style={styles.title}>{session.title || titleFromMessages(session.messages)}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>{session.messages.length} 条消息 · {modeLabel(session.run_mode)} · 长按设置</Text>
            </View>
            <IconButton icon={MoreHorizontal} label="会话操作" onPress={() => showActions(session)} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function modeLabel(mode: string) {
  if (mode === "assistant") return "助理";
  if (mode === "agent_group") return "工作室";
  return "聊天";
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 10,
  },
  newButton: {
    marginBottom: 6,
  },
  item: {
    minHeight: 74,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 12,
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
  itemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    gap: 8,
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
  },
});
