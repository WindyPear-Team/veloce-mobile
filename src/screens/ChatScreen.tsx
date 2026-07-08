import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bot, ChevronDown, ChevronRight, Menu, Plus, Send, Settings, Square, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeSession, createMessage, createSession, deleteSession, getAgents, getCatalog, getSessions, isRunActive, messageContentWithAttachments, saveSession, selectedSessionKey, stopRun, titleFromMessages, uploadAttachment } from "../api/chat";
import { IconButton } from "../components/IconButton";
import { colors } from "../theme/colors";
import type { ChatAgent, ChatAttachment, ChatMessage, ChatSession, RootStackParamList, UserChannelCatalog } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export function ChatScreen({ navigation, route }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [catalog, setCatalog] = useState<UserChannelCatalog[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessions, channels, agentItems, storedID] = await Promise.all([
        getSessions(),
        getCatalog().catch(() => []),
        getAgents().catch(() => []),
        AsyncStorage.getItem(selectedSessionKey),
      ]);
      setCatalog(channels);
      setAgents(agentItems);
      setSessions(sessions);
      const requestedID = route.params?.sessionID || "";
      const active = requestedID
        ? sessions.find((item) => item.id === requestedID) || createSession(defaultSessionConfig(channels))
        : createSession(defaultSessionConfig(channels));
      if (requestedID && sessions.some((item) => item.id === requestedID)) {
        await AsyncStorage.setItem(selectedSessionKey, active.id);
      } else if (!requestedID && storedID) {
        await AsyncStorage.removeItem(selectedSessionKey);
      }
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
      headerLeft: () => <IconButton icon={Menu} label="会话" onPress={() => setDrawerOpen(true)} />,
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton icon={Settings} label="设置" onPress={() => navigation.navigate("Settings")} />
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
          setSessions(sessions);
        }
      } catch {
        // Keep the current optimistic state; the next refresh can recover.
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [session?.id, session?.latest_run?.status]);

  useEffect(() => {
    if (sending || isRunActive(session || undefined)) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [sending, session?.latest_run?.status]);

  const missingConfig = useMemo(() => {
    if (!session) return "";
    if (session.run_mode !== "agent_group" && !session.model_name) return "请先选择模型。";
    if (session.run_mode !== "agent_group" && !session.user_channel_id) return "请先在会话设置里选择渠道。";
    if (session.run_mode === "agent_group" && !session.agent_group_id) return "请先在会话设置里选择工作室。";
    return "";
  }, [session]);
  const modelOptions = useMemo(() => Array.from(new Set(catalog.flatMap((item) => item.models || []))), [catalog]);
  const assistantName = useMemo(() => agentName(agents, session?.agent_id), [agents, session?.agent_id]);
  const selectedModelIconURL = useMemo(() => modelIconURL(catalog, session?.model_name || "", session?.user_channel_id), [catalog, session?.model_name, session?.user_channel_id]);

  const send = async () => {
    const content = prompt.trim();
    if (!session || (!content && attachments.length === 0) || sending) return;
    const persistedSession = await ensurePersistedSession(session);
    if (missingConfig) {
      Alert.alert("配置不完整", missingConfig);
      if (!persistedSession.model_name) {
        setModelMenuOpen(true);
      } else {
        navigation.navigate("SessionSettings", { sessionID: persistedSession.id });
      }
      return;
    }
    const messageContent = messageContentWithAttachments(content, attachments);
    const userMessage = createMessage("user", messageContent);
    const nextSession = {
      ...persistedSession,
      title: persistedSession.title || titleFromMessages([...persistedSession.messages, userMessage]),
      messages: [...persistedSession.messages, userMessage],
      updated_at: new Date().toISOString(),
    };
    setSession(nextSession);
    setSessions((current) => upsertSession(current, nextSession));
    setPrompt("");
    setAttachments([]);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await completeSession(nextSession, nextSession.messages, controller.signal);
      if (result.session) {
        setSession(result.session);
        setSessions((current) => upsertSession(current, result.session as ChatSession));
      } else if (result.message?.content) {
        const assistantMessage = {
          ...createMessage("assistant", result.message.content),
          id: result.message.id || createMessage("assistant", "").id,
          content_parts: result.message.content_parts || [{ round: 1, content: result.message.content }],
          tool_calls: result.message.tool_calls || [],
        };
        setSession((current) => {
          if (!current) return current;
          const next = { ...current, messages: [...current.messages, assistantMessage], updated_at: new Date().toISOString() };
          setSessions((items) => upsertSession(items, next));
          return next;
        });
      } else {
        const sessions = await getSessions();
        const updated = sessions.find((item) => item.id === nextSession.id);
        if (updated) setSession(updated);
        setSessions(sessions);
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      Alert.alert("发送失败", err instanceof Error ? err.message : "请求失败。");
      setSession(session);
      setPrompt(content);
      setAttachments(attachments);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setSending(false);
    }
  };

  const pickAttachments = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const next: ChatAttachment[] = [];
      for (const asset of result.assets.slice(0, Math.max(1, 8 - attachments.length))) {
        next.push(await uploadAttachment({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }));
      }
      if (next.length) {
        setAttachments((current) => [...current, ...next].slice(0, 8));
      }
    } catch (err) {
      Alert.alert("上传失败", err instanceof Error ? err.message : "无法上传附件。");
    } finally {
      setUploading(false);
    }
  };

  const refreshSessions = async () => {
    const items = await getSessions();
    setSessions(items);
    return items;
  };

  const selectSession = async (sessionID: string) => {
    const next = sessions.find((item) => item.id === sessionID) || (await refreshSessions()).find((item) => item.id === sessionID);
    if (!next) return;
    await AsyncStorage.setItem(selectedSessionKey, next.id);
    setSession(next);
    setDrawerOpen(false);
    navigation.setParams({ sessionID: next.id });
  };

  const ensurePersistedSession = async (target: ChatSession) => {
    if (sessions.some((item) => item.id === target.id)) {
      return target;
    }
    const saved = await saveSession(target);
    await AsyncStorage.setItem(selectedSessionKey, saved.id);
    setSessions((current) => upsertSession(current, saved));
    setSession(saved);
    navigation.setParams({ sessionID: saved.id });
    return saved;
  };

  const updateSessionModel = async (modelName: string) => {
    if (!session) return;
    const nextChannelID = channelIDForModel(catalog, modelName, session.user_channel_id);
    const next = { ...session, model_name: modelName, user_channel_id: nextChannelID || session.user_channel_id, updated_at: new Date().toISOString() };
    setSession(next);
    setModelMenuOpen(false);
    if (sessions.some((item) => item.id === next.id)) {
      try {
        const saved = await saveSession(next);
        setSession(saved);
        setSessions((current) => upsertSession(current, saved));
      } catch (err) {
        Alert.alert("保存失败", err instanceof Error ? err.message : "无法保存模型设置。");
      }
    }
  };

  const createNewSession = async () => {
    const draft = createSession(defaultSessionConfig(catalog));
    await AsyncStorage.removeItem(selectedSessionKey);
    setSession(draft);
    setDrawerOpen(false);
    navigation.setParams({ sessionID: undefined });
  };

  const removeSession = async (sessionID: string) => {
    await deleteSession(sessionID);
    const nextSessions = sessions.filter((item) => item.id !== sessionID);
    setSessions(nextSessions);
    if (session?.id === sessionID) {
      const next = nextSessions[0] || null;
      setSession(next);
      await AsyncStorage.setItem(selectedSessionKey, next?.id || "");
      navigation.setParams({ sessionID: next?.id });
    }
  };

  const showSessionActions = (target: ChatSession) => {
    Alert.alert(target.title || "新会话", "选择操作", [
      { text: "取消", style: "cancel" },
      { text: "会话设置", onPress: () => {
        setDrawerOpen(false);
        navigation.navigate("SessionSettings", { sessionID: target.id });
      } },
      { text: "删除", style: "destructive", onPress: () => void removeSession(target.id) },
    ]);
  };

  const stop = async () => {
    if (!session || stopping) return;
    setStopping(true);
    try {
      const runID = await findActiveRunID(session.id, session.latest_run?.id, setSession, setSessions);
      if (!runID) {
        Alert.alert("暂时无法停止", "服务器还没有返回可停止的任务 ID，请稍后再试。");
        return;
      }
      await stopRun(runID);
      const controller = abortControllerRef.current;
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      const sessions = await getSessions();
      const updated = sessions.find((item) => item.id === session.id);
      if (updated) {
        setSession(updated);
        setSessions(sessions);
      }
    } catch (err) {
      Alert.alert("停止失败", err instanceof Error ? err.message : "无法停止任务。");
    } finally {
      setStopping(false);
    }
  };

  if (loading && !session) {
    return <Text style={styles.loading}>正在加载...</Text>;
  }

  const working = sending || stopping || isRunActive(session || undefined);
  const sendDisabled = !working && !prompt.trim() && attachments.length === 0;
  const workingStatus = stopping ? "正在停止..." : runStatus(session?.latest_run?.status_message || session?.latest_run?.status || "running");

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
            </View>

            {missingConfig ? (
              <Pressable onPress={() => void ensurePersistedSession(session).then((saved) => navigation.navigate("SessionSettings", { sessionID: saved.id }))} style={styles.notice}>
                <Text style={styles.noticeText}>{missingConfig}</Text>
              </Pressable>
            ) : null}

            <FlatList
              ref={listRef}
              data={session.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={session.messages.length ? styles.messages : styles.emptyMessages}
              renderItem={({ item }) => <MessageBubble message={item} assistantName={assistantName} />}
              ListEmptyComponent={<EmptyState hasCatalog={catalog.length > 0} />}
              ListFooterComponent={working ? <AssistantWorking status={workingStatus} assistantName={assistantName} /> : null}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            />

            {attachments.length > 0 ? (
              <View style={styles.attachments}>
                {attachments.map((attachment) => (
                  <Pressable key={attachment.id} onPress={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} style={styles.attachmentChip}>
                    <Text numberOfLines={1} style={styles.attachmentText}>{attachment.name}</Text>
                    <X size={14} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.modelToolbar}>
              <Pressable accessibilityLabel={session.model_name || "选择模型"} onPress={() => setModelMenuOpen(true)} style={({ pressed }) => [styles.modelButton, pressed && styles.addPressed]}>
                <ModelIcon iconURL={selectedModelIconURL} size={22} />
              </Pressable>
              <Pressable onPress={() => void ensurePersistedSession(session).then((saved) => navigation.navigate("SessionSettings", { sessionID: saved.id }))} style={({ pressed }) => [styles.toolbarIconButton, pressed && styles.addPressed]}>
                <Settings size={18} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.composer}>
              <Pressable disabled={uploading} onPress={pickAttachments} style={({ pressed }) => [styles.addButton, pressed && styles.addPressed, uploading && styles.sendDisabled]}>
                <Plus size={22} color={colors.primary} />
              </Pressable>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="输入消息"
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
              />
              <Pressable disabled={sendDisabled} onPress={working ? stop : send} style={({ pressed }) => [styles.sendButton, working && styles.stopSendButton, sendDisabled && styles.sendDisabled, pressed && (working ? styles.stopSendPressed : styles.sendPressed)]}>
                {working ? <Square size={18} color="#fff" fill="#fff" /> : <Send size={20} color="#fff" />}
              </Pressable>
            </View>
            <SessionDrawer
              open={drawerOpen}
              sessions={sessions}
              activeID={sessions.some((item) => item.id === session.id) ? session.id : ""}
              onClose={() => setDrawerOpen(false)}
              onCreate={() => void createNewSession()}
              onSelect={(id) => void selectSession(id)}
              onLongPress={showSessionActions}
            />
            <ModelPicker
              open={modelMenuOpen}
              selectedModel={session.model_name || ""}
              models={modelOptions}
              catalog={catalog}
              channelID={session.user_channel_id}
              onClose={() => setModelMenuOpen(false)}
              onSelect={(model) => void updateSessionModel(model)}
            />
          </>
        ) : (
          <Text style={styles.loading}>没有可用会话。</Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModelPicker({
  open,
  selectedModel,
  models,
  catalog,
  channelID,
  onClose,
  onSelect,
}: {
  open: boolean;
  selectedModel: string;
  models: string[];
  catalog: UserChannelCatalog[];
  channelID?: number;
  onClose: () => void;
  onSelect: (model: string) => void;
}) {
  const selectedIndex = Math.max(0, models.findIndex((item) => item === selectedModel));
  const listRef = useRef<FlatList<string> | null>(null);

  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: selectedIndex, animated: false, viewPosition: 0.35 });
    }, 80);
    return () => clearTimeout(timer);
  }, [open, selectedIndex]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modelPickerRoot}>
        <Pressable style={styles.modelPickerBackdrop} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.modelPicker}>
          <Text style={styles.modelPickerTitle}>选择模型</Text>
          <FlatList
            ref={listRef}
            data={models}
            keyExtractor={(item) => item}
            initialScrollIndex={models.length && selectedIndex > 0 ? selectedIndex : undefined}
            getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index - 80), animated: false }), 80);
            }}
            style={styles.modelPickerList}
            renderItem={({ item }) => {
              const selected = item === selectedModel;
              return (
                <Pressable onPress={() => onSelect(item)} style={({ pressed }) => [styles.modelOption, selected && styles.modelOptionSelected, pressed && styles.addPressed]}>
                  <ModelIcon iconURL={modelIconURL(catalog, item, channelID)} size={20} muted={!selected} />
                  <Text numberOfLines={1} style={styles.modelOptionText}>{item}</Text>
                  {selected ? <Text style={styles.modelSelectedMark}>已选</Text> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyDrawer}>当前账号还没有可用模型</Text>}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ModelIcon({ iconURL, size, muted }: { iconURL?: string; size: number; muted?: boolean }) {
  if (iconURL) {
    return <Image source={{ uri: iconURL }} style={[styles.modelIconImage, { width: size, height: size, borderRadius: Math.max(4, size / 2) }]} />;
  }
  return <Bot size={size} color={muted ? colors.muted : colors.primary} />;
}

function SessionDrawer({
  open,
  sessions,
  activeID,
  onClose,
  onCreate,
  onSelect,
  onLongPress,
}: {
  open: boolean;
  sessions: ChatSession[];
  activeID: string;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (sessionID: string) => void;
  onLongPress: (session: ChatSession) => void;
}) {
  const slide = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    if (!open) return;
    slide.setValue(-320);
    Animated.timing(slide, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerRoot}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} />
        <Animated.View style={[styles.drawerAnimated, { transform: [{ translateX: slide }] }]}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>会话</Text>
            <IconButton icon={X} label="关闭" onPress={onClose} />
          </View>
          <Pressable onPress={onCreate} style={styles.newSessionButton}>
            <Plus size={18} color="#fff" />
            <Text style={styles.newSessionText}>新建会话</Text>
          </Pressable>
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.drawerList}
            renderItem={({ item }) => {
              const selected = item.id === activeID;
              return (
                <Pressable onPress={() => onSelect(item.id)} onLongPress={() => onLongPress(item)} style={[styles.drawerItem, selected && styles.drawerItemActive]}>
                  <View style={styles.drawerItemCopy}>
                    <Text numberOfLines={1} style={styles.drawerItemTitle}>{item.title || titleFromMessages(item.messages)}</Text>
                    <Text numberOfLines={1} style={styles.drawerItemMeta}>{item.messages.length} 条 · {modeLabel(item.run_mode)}</Text>
                  </View>
                  <Trash2 size={16} color={colors.muted} />
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyDrawer}>还没有会话</Text>}
          />
        </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MessageBubble({ message, assistantName }: { message: ChatMessage; assistantName: string }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.bubbleRole, isUser && styles.userBubbleRole]}>{isUser ? "你" : assistantName}</Text>
        <Text selectable style={[styles.bubbleText, isUser && styles.userBubbleText]}>{message.content || " "}</Text>
        {message.tool_calls?.length ? <ToolCallList calls={message.tool_calls} /> : null}
      </View>
    </View>
  );
}

function AssistantWorking({ status, assistantName }: { status: string; assistantName: string }) {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        140,
        dots.map((dot) => Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 420,
            useNativeDriver: true,
          }),
        ])),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);

  return (
    <View style={styles.workingRow}>
      <View style={[styles.bubble, styles.assistantBubble, styles.workingBubble]}>
        <Text style={styles.bubbleRole}>{assistantName}</Text>
        <View style={styles.workingLine}>
          <Text style={styles.workingText}>{status}</Text>
          <View style={styles.workingDots}>
            {dots.map((dot, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.workingDot,
                  {
                    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                    transform: [{
                      translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
                    }],
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function ToolCallList({ calls }: { calls: NonNullable<ChatMessage["tool_calls"]> }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <View style={styles.toolList}>
      <Pressable onPress={() => setExpanded((value) => !value)} style={styles.toolSummary}>
        <Text style={styles.toolTitle}>工具调用 · {calls.length}</Text>
        <Icon size={15} color={colors.muted} />
      </Pressable>
      {expanded ? (
        calls.map((call, index) => (
          <View key={call.id || `${call.name}-${index}`} style={styles.toolItem}>
            <View style={styles.toolHeader}>
              <Text numberOfLines={1} style={styles.toolName}>{call.name || call.tool || "tool"}</Text>
              <Text style={[styles.toolStatus, toolStatusStyle(call.status)]}>{toolStatusText(call.status)}</Text>
            </View>
            {call.server || call.tool ? <Text numberOfLines={1} style={styles.toolMeta}>{[call.server, call.tool].filter(Boolean).join(" / ")}</Text> : null}
            {call.result ? <Text numberOfLines={4} style={styles.toolResult}>{call.result}</Text> : null}
          </View>
        ))
      ) : null}
    </View>
  );
}

function EmptyState({ hasCatalog }: { hasCatalog: boolean }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.greetingTitle}>{greetingTitle()}</Text>
      <Text style={styles.emptyText}>{hasCatalog ? "有什么想处理的，直接告诉我。" : "当前服务器还没有读取到模型渠道，请检查账号或服务器配置。"}</Text>
    </View>
  );
}

function greetingTitle() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 19) return "下午好";
  return "晚上好";
}

function defaultSessionConfig(catalog: UserChannelCatalog[]): Partial<ChatSession> {
  const channel = catalog[0];
  return {
    user_channel_id: channel?.id,
    model_name: channel?.models?.[0] || "",
    agent_id: "default",
  };
}

async function findActiveRunID(
  sessionID: string,
  currentRunID: string | undefined,
  setSession: (session: ChatSession) => void,
  setSessions: (sessions: ChatSession[]) => void,
) {
  if (currentRunID) {
    return currentRunID;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sessions = await getSessions();
    const updated = sessions.find((item) => item.id === sessionID);
    setSessions(sessions);
    if (updated) {
      setSession(updated);
      if (updated.latest_run?.id && isRunActive(updated)) {
        return updated.latest_run.id;
      }
    }
    await delay(350);
  }
  return "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modeLabel(mode: string) {
  if (mode === "assistant") return "助理";
  if (mode === "agent_group") return "工作室";
  return "聊天";
}

function agentName(agents: ChatAgent[], id?: string) {
  return agents.find((item) => item.id === (id || "default"))?.name || "默认助理";
}

function channelIDForModel(catalog: UserChannelCatalog[], modelName: string, currentChannelID?: number) {
  const current = catalog.find((channel) => channel.id === currentChannelID);
  if (current?.models?.includes(modelName)) {
    return current.id;
  }
  return catalog.find((channel) => channel.models?.includes(modelName))?.id;
}

function modelIconURL(catalog: UserChannelCatalog[], modelName: string, channelID?: number) {
  if (!modelName) return "";
  const preferred = catalog.find((channel) => channel.id === channelID);
  const preferredIcon = preferred?.model_icons?.[modelName];
  if (preferredIcon) return preferredIcon;
  for (const channel of catalog) {
    const icon = channel.model_icons?.[modelName];
    if (icon) return icon;
  }
  return "";
}

function runStatus(status: string) {
  if (status === "queued") return "任务排队中...";
  if (status === "loading_tools") return "正在加载工具...";
  if (status === "model_round") return "模型正在处理...";
  return "助理正在运行...";
}

function upsertSession(sessions: ChatSession[], next: ChatSession) {
  return sessions.some((item) => item.id === next.id)
    ? sessions.map((item) => item.id === next.id ? next : item)
    : [next, ...sessions];
}

function toolStatusText(status: string) {
  if (status === "completed" || status === "success") return "完成";
  if (status === "failed" || status === "error") return "失败";
  if (status === "running") return "运行中";
  return status || "未知";
}

function toolStatusStyle(status: string) {
  if (status === "completed" || status === "success") return styles.toolStatusOk;
  if (status === "failed" || status === "error") return styles.toolStatusError;
  return styles.toolStatusPending;
}

function isAbortError(err: unknown) {
  return err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"));
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
  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
  },
  drawerAnimated: {
    width: 308,
    maxWidth: "86%",
    height: "100%",
  },
  drawer: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 12,
  },
  drawerHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  newSessionButton: {
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  newSessionText: {
    color: "#fff",
    fontWeight: "900",
  },
  drawerList: {
    paddingVertical: 12,
    gap: 8,
  },
  drawerItem: {
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerItemActive: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  drawerItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  drawerItemTitle: {
    color: colors.text,
    fontWeight: "800",
  },
  drawerItemMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
  },
  emptyDrawer: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 20,
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
  toolList: {
    marginTop: 6,
    gap: 6,
  },
  toolSummary: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  toolItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 8,
    gap: 4,
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolName: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  toolStatus: {
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "800",
  },
  toolStatusOk: {
    backgroundColor: "#dcfce7",
    color: colors.success,
  },
  toolStatusError: {
    backgroundColor: "#fee2e2",
    color: colors.danger,
  },
  toolStatusPending: {
    backgroundColor: "#fef3c7",
    color: colors.warning,
  },
  toolMeta: {
    color: colors.muted,
    fontSize: 11,
  },
  toolResult: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  workingRow: {
    alignItems: "flex-start",
  },
  workingBubble: {
    minWidth: 168,
  },
  workingLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workingText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  workingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  workingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
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
  modelToolbar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  modelIconImage: {
    backgroundColor: colors.surfaceMuted,
  },
  toolbarIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  modelPickerRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modelPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  modelPicker: {
    maxHeight: "62%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  modelPickerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },
  modelPickerList: {
    maxHeight: 360,
  },
  modelOption: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  modelOptionSelected: {
    backgroundColor: "#eff6ff",
  },
  modelOptionText: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontWeight: "800",
  },
  modelSelectedMark: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  attachments: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  attachmentChip: {
    maxWidth: "48%",
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  attachmentText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  addPressed: {
    backgroundColor: colors.surfaceMuted,
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
  stopSendButton: {
    backgroundColor: colors.danger,
  },
  sendPressed: {
    backgroundColor: colors.primaryDark,
  },
  stopSendPressed: {
    backgroundColor: "#b91c1c",
  },
  emptyState: {
    alignItems: "center",
    gap: 10,
  },
  greetingTitle: {
    fontSize: 34,
    lineHeight: 40,
    color: colors.text,
    fontWeight: "900",
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
