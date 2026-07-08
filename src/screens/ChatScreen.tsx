import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { List, Send, Server, Settings } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeSession, createMessage, createSession, getCatalog, getSessions, isRunActive, saveSession, selectedSessionKey, stopRun, titleFromMessages } from "../api/chat";
import { IconButton } from "../components/IconButton";
import { colors } from "../theme/colors";
import type { ChatMessage, ChatSession, RootStackParamList, UserChannelCatalog } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export function ChatScreen({ navigation, route }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [catalog, setCatalog] = useState<UserChannelCatalog[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessions, channels, storedID] = await Promise.all([
        getSessions(),
        getCatalog().catch(() => []),
        AsyncStorage.getItem(selectedSessionKey),
      ]);
      setCatalog(channels);
      const requestedID = route.params?.sessionID || storedID || "";
      let active = sessions.find((item) => item.id === requestedID) || sessions[0] || null;
      if (!active) {
        active = createSession(defaultSessionConfig(channels));
        active = await saveSession(active);
      }
      await AsyncStorage.setItem(selectedSessionKey, active.id);
      setSession(active);
    } catch (err) {
      Alert.alert("加载失败", err instanceof Error ? err.message : "无法加载聊天。");
    } finally {
      setLoading(false);
    }
  }, [route.params?.sessionID]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton icon={List} label="会话" onPress={() => navigation.navigate("Sessions")} />
          <IconButton icon={Settings} label="设置" onPress={() => navigation.navigate("Settings")} />
          <IconButton icon={Server} label="服务器" onPress={() => navigation.navigate("Server")} />
        </View>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (!session || !isRunActive(session)) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const sessions = await getSessions();
        const updated = sessions.find((item) => item.id === session.id);
        if (updated) {
          setSession(updated);
        }
      } catch {
        // Keep the current optimistic state; the next refresh can recover.
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [session?.id, session?.latest_run?.status]);

  const missingConfig = useMemo(() => {
    if (!session) return "";
    if (session.run_mode !== "agent_group" && !session.model_name) return "请先在设置页选择模型。";
    if (session.run_mode !== "agent_group" && !session.user_channel_id) return "请先在设置页选择渠道。";
    if (session.run_mode === "agent_group" && !session.agent_group_id) return "请先在设置页选择工作室。";
    return "";
  }, [session]);

  const send = async () => {
    const content = prompt.trim();
    if (!session || !content || sending) return;
    if (missingConfig) {
      Alert.alert("配置不完整", missingConfig);
      navigation.navigate("Settings");
      return;
    }
    const userMessage = createMessage("user", content);
    const nextSession = {
      ...session,
      title: session.title || titleFromMessages([...session.messages, userMessage]),
      messages: [...session.messages, userMessage],
      updated_at: new Date().toISOString(),
    };
    setSession(nextSession);
    setPrompt("");
    setSending(true);
    try {
      const result = await completeSession(nextSession, nextSession.messages);
      if (result.session) {
        setSession(result.session);
      } else if (result.message?.content) {
        const assistantMessage = {
          ...createMessage("assistant", result.message.content),
          id: result.message.id || createMessage("assistant", "").id,
          content_parts: result.message.content_parts || [{ round: 1, content: result.message.content }],
          tool_calls: result.message.tool_calls || [],
        };
        setSession((current) => current ? { ...current, messages: [...current.messages, assistantMessage], updated_at: new Date().toISOString() } : current);
      } else {
        const sessions = await getSessions();
        const updated = sessions.find((item) => item.id === nextSession.id);
        if (updated) setSession(updated);
      }
    } catch (err) {
      Alert.alert("发送失败", err instanceof Error ? err.message : "请求失败。");
      setSession(session);
      setPrompt(content);
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    if (!session?.latest_run?.id) return;
    try {
      await stopRun(session.latest_run.id);
      const sessions = await getSessions();
      const updated = sessions.find((item) => item.id === session.id);
      if (updated) setSession(updated);
    } catch (err) {
      Alert.alert("停止失败", err instanceof Error ? err.message : "无法停止任务。");
    }
  };

  if (loading && !session) {
    return <Text style={styles.loading}>正在加载...</Text>;
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        {session ? (
          <>
            <View style={styles.sessionBar}>
              <View style={styles.sessionCopy}>
                <Text numberOfLines={1} style={styles.sessionTitle}>{session.title || "新会话"}</Text>
                <Text numberOfLines={1} style={styles.sessionMeta}>{modeLabel(session.run_mode)} · {session.model_name || "未选择模型"}</Text>
              </View>
              {isRunActive(session) ? (
                <Pressable onPress={stop} style={styles.stopButton}>
                  <Text style={styles.stopText}>停止</Text>
                </Pressable>
              ) : null}
            </View>

            {missingConfig ? (
              <Pressable onPress={() => navigation.navigate("Settings")} style={styles.notice}>
                <Text style={styles.noticeText}>{missingConfig}</Text>
              </Pressable>
            ) : null}

            <FlatList
              ref={listRef}
              data={session.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={session.messages.length ? styles.messages : styles.emptyMessages}
              renderItem={({ item }) => <MessageBubble message={item} />}
              ListEmptyComponent={<EmptyState onOpenSettings={() => navigation.navigate("Settings")} hasCatalog={catalog.length > 0} />}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            />

            {isRunActive(session) ? <Text style={styles.running}>{runStatus(session.latest_run?.status_message || session.latest_run?.status || "running")}</Text> : null}

            <View style={styles.composer}>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="输入消息"
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
              />
              <Pressable disabled={!prompt.trim() || sending || isRunActive(session)} onPress={send} style={({ pressed }) => [styles.sendButton, (!prompt.trim() || sending || isRunActive(session)) && styles.sendDisabled, pressed && styles.sendPressed]}>
                <Send size={20} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.loading}>没有可用会话。</Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.bubbleRole, isUser && styles.userBubbleRole]}>{isUser ? "你" : "助理"}</Text>
        <Text selectable style={[styles.bubbleText, isUser && styles.userBubbleText]}>{message.content || " "}</Text>
        {message.tool_calls?.length ? <Text style={styles.toolText}>{message.tool_calls.length} 次工具调用</Text> : null}
      </View>
    </View>
  );
}

function EmptyState({ onOpenSettings, hasCatalog }: { onOpenSettings: () => void; hasCatalog: boolean }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>开始一个新会话</Text>
      <Text style={styles.emptyText}>{hasCatalog ? "发送消息前可以先进入设置选择模型、助理、技能、MCP 和连接器。" : "当前服务器还没有读取到模型渠道，请检查账号或服务器配置。"}</Text>
      <Pressable onPress={onOpenSettings} style={styles.emptyButton}>
        <Text style={styles.emptyButtonText}>打开设置</Text>
      </Pressable>
    </View>
  );
}

function defaultSessionConfig(catalog: UserChannelCatalog[]): Partial<ChatSession> {
  const channel = catalog[0];
  return {
    user_channel_id: channel?.id,
    model_name: channel?.models?.[0] || "",
    agent_id: "default",
  };
}

function modeLabel(mode: string) {
  if (mode === "assistant") return "助理";
  if (mode === "agent_group") return "工作室";
  return "聊天";
}

function runStatus(status: string) {
  if (status === "queued") return "任务排队中...";
  if (status === "loading_tools") return "正在加载工具...";
  if (status === "model_round") return "模型正在处理...";
  return "助理正在运行...";
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  loading: {
    padding: 20,
    color: colors.muted,
    textAlign: "center",
  },
  sessionBar: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  sessionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  stopButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stopText: {
    color: colors.danger,
    fontWeight: "800",
  },
  notice: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#facc15",
    backgroundColor: "#fefce8",
  },
  noticeText: {
    color: "#854d0e",
    fontWeight: "700",
  },
  messages: {
    padding: 16,
    gap: 12,
  },
  emptyMessages: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  bubbleRow: {
    alignItems: "flex-start",
  },
  bubbleRowUser: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userBubble: {
    backgroundColor: colors.primary,
  },
  bubbleRole: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  userBubbleRole: {
    color: "#dbeafe",
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  userBubbleText: {
    color: "#fff",
  },
  toolText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  running: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: colors.primary,
    fontWeight: "700",
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  input: {
    flex: 1,
    maxHeight: 130,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 10,
    color: colors.text,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.45,
  },
  sendPressed: {
    backgroundColor: colors.primaryDark,
  },
  emptyState: {
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  emptyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
});

