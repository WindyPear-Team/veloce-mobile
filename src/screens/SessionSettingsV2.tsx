import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check, ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getAgentGroups, getAgents, getCatalog, getDevices, getMCPSettings, getSessions, getSkills, saveSession, selectedSessionKey } from "../api/chat";
import { Field } from "../components/Field";
import { colors } from "../theme/colors";
import type { ChatAgent, ChatAgentGroup, ChatRunMode, ChatSession, ChatSkill, ConnectorDevice, MCPServer, RootStackParamList, UserChannelCatalog } from "../types";

type SettingsProps = NativeStackScreenProps<RootStackParamList, "SessionSettings">;
type DetailProps = NativeStackScreenProps<RootStackParamList, "SessionSettingDetail">;
type AddProps = NativeStackScreenProps<RootStackParamList, "SessionAddItems">;

export function SessionSettingsScreen({ navigation, route }: SettingsProps) {
  const state = useSessionSettingsData(route.params?.sessionID);
  const session = state.session;

  if (state.loading && !session) return <Text style={styles.loading}>正在加载...</Text>;
  if (!session) return <Text style={styles.loading}>请先创建或选择一个会话。</Text>;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.summary}>{session.title || "新会话"}</Text>
      <NavRow title="运行模式" value={modeLabel(session.run_mode)} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "mode" })} />
      {session.run_mode === "agent_group" ? (
        <NavRow title="工作室" value={groupName(state.groups, session.agent_group_id)} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "studio" })} />
      ) : (
        <>
          <NavRow title="渠道" value={channelName(state.catalog, session.user_channel_id)} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "channel" })} />
          <NavRow title="助理" value={agentName(state.agents, session.agent_id)} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "agent" })} />
        </>
      )}
      <NavRow title="技能" value={`${session.skill_ids?.length || 0} 个`} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "skills" })} />
      <NavRow title="MCP" value={`${session.mcp_server_ids?.length || 0} 个`} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "mcp" })} />
      {session.run_mode !== "chat" ? (
        <NavRow title="连接器" value={deviceName(state.devices, session.connector_device_id)} onPress={() => navigation.navigate("SessionSettingDetail", { sessionID: session.id, section: "connector" })} />
      ) : null}
    </ScrollView>
  );
}

export function SessionSettingDetailScreen({ navigation, route }: DetailProps) {
  const state = useSessionSettingsData(route.params.sessionID);
  const session = state.session;

  if (state.loading && !session) return <Text style={styles.loading}>正在加载...</Text>;
  if (!session) return <Text style={styles.loading}>会话不存在。</Text>;

  const update = (patch: Partial<ChatSession>) => void state.update(patch);
  const section = route.params.section;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {section === "mode" ? (
        <>
          <SelectRow title="聊天" subtitle="普通对话" selected={session.run_mode === "chat"} onPress={() => updateMode(session, "chat", update)} />
          <SelectRow title="助理模式" subtitle="工具、技能、MCP 和连接器" selected={session.run_mode === "assistant"} onPress={() => updateMode(session, "assistant", update)} />
          <SelectRow title="工作室模式" subtitle="多代理协作" selected={session.run_mode === "agent_group"} onPress={() => updateMode(session, "agent_group", update)} />
        </>
      ) : null}

      {section === "channel" ? state.catalog.map((channel) => (
        <SelectRow key={channel.id} title={channel.name} subtitle={(channel.models || []).join(", ")} selected={session.user_channel_id === channel.id} onPress={() => update({ user_channel_id: channel.id })} />
      )) : null}

      {section === "agent" ? state.agents.map((agent) => (
        <SelectRow key={agent.id} title={agent.name || agent.id} subtitle={agent.default_model || "助理"} selected={(session.agent_id || "default") === agent.id} onPress={() => update(agentSelectionPatch(agent, state.catalog, session.model_name))} />
      )) : null}

      {section === "studio" ? state.groups.map((group) => (
        <SelectRow key={group.id} title={group.name || group.id} selected={session.agent_group_id === group.id} onPress={() => update({ agent_group_id: group.id })} />
      )) : null}

      {section === "skills" ? (
        <>
          <Pressable style={styles.addButton} onPress={() => navigation.navigate("SessionAddItems", { sessionID: session.id, type: "skills" })}>
            <Text style={styles.addButtonText}>添加技能</Text>
          </Pressable>
          {state.skills.filter((skill) => session.skill_ids?.includes(skill.id)).map((skill) => (
            <AddRow key={skill.id} title={skill.name} subtitle={skill.description || "技能"} added onPress={() => update({ skill_ids: removeID(session.skill_ids || [], skill.id) })} />
          ))}
          {session.skill_ids.length === 0 ? <Text style={styles.empty}>还没有添加技能</Text> : null}
        </>
      ) : null}

      {section === "mcp" ? (
        <>
          <Pressable style={styles.addButton} onPress={() => navigation.navigate("SessionAddItems", { sessionID: session.id, type: "mcp" })}>
            <Text style={styles.addButtonText}>添加 MCP</Text>
          </Pressable>
          {state.mcpServers.filter((server) => session.mcp_server_ids?.includes(server.id)).map((server) => (
            <AddRow key={server.id} title={server.name} subtitle={server.type === "connector" ? server.command || "connector" : server.url || "MCP"} added onPress={() => update({ mcp_server_ids: removeID(session.mcp_server_ids || [], server.id) })} />
          ))}
          {session.mcp_server_ids.length === 0 ? <Text style={styles.empty}>还没有添加 MCP</Text> : null}
        </>
      ) : null}

      {section === "connector" ? (
        <>
          {state.devices.map((device) => (
            <SelectRow key={device.id} title={device.name || device.id} subtitle={device.online ? "在线" : device.status || "离线"} selected={session.connector_device_id === device.id} onPress={() => update({ connector_device_id: session.connector_device_id === device.id ? undefined : device.id })} />
          ))}
          <Field label="工作目录" value={state.workspace} onChangeText={state.setWorkspace} onBlur={() => update({ connector_workspace_path: state.workspace.trim() })} placeholder="D:\\dev\\project 或 /Users/me/project" />
          {state.recentWorkspacePaths.length > 0 ? (
            <View style={styles.recentBlock}>
              <Text style={styles.recentTitle}>最近工作目录</Text>
              {state.recentWorkspacePaths.map((workspacePath) => (
                <Pressable
                  key={workspacePath}
                  onPress={() => {
                    state.setWorkspace(workspacePath);
                    update({ connector_workspace_path: workspacePath });
                  }}
                  style={({ pressed }) => [styles.recentRow, pressed && styles.rowPressed]}
                >
                  <Text numberOfLines={1} style={styles.recentPath}>{workspacePath}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <SwitchRow title="自动批准连接器任务" value={session.connector_auto_approve} onValueChange={(value) => update({ connector_auto_approve: value })} />
        </>
      ) : null}
    </ScrollView>
  );
}

export function SessionAddItemsScreen({ route }: AddProps) {
  const state = useSessionSettingsData(route.params.sessionID);
  const session = state.session;
  if (state.loading && !session) return <Text style={styles.loading}>正在加载...</Text>;
  if (!session) return <Text style={styles.loading}>会话不存在。</Text>;

  if (route.params.type === "skills") {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        {state.skills.map((skill) => (
          <AddRow key={skill.id} title={skill.name} subtitle={skill.description || "技能"} added={session.skill_ids?.includes(skill.id)} onPress={() => state.update({ skill_ids: toggleID(session.skill_ids || [], skill.id) })} />
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {state.mcpServers.map((server) => (
        <AddRow key={server.id} title={server.name} subtitle={server.type === "connector" ? server.command || "connector" : server.url || "MCP"} added={session.mcp_server_ids?.includes(server.id)} onPress={() => state.update({ mcp_server_ids: toggleID(session.mcp_server_ids || [], server.id) })} />
      ))}
    </ScrollView>
  );
}

function useSessionSettingsData(sessionID?: string) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [catalog, setCatalog] = useState<UserChannelCatalog[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<ChatAgentGroup[]>([]);
  const [skills, setSkills] = useState<ChatSkill[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServer[]>([]);
  const [devices, setDevices] = useState<ConnectorDevice[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storedID, sessions, channelItems, agentItems, skillItems, settings, deviceItems, groupItems] = await Promise.all([
        AsyncStorage.getItem(selectedSessionKey),
        getSessions(),
        getCatalog(),
        getAgents(),
        getSkills(),
        getMCPSettings(),
        getDevices(),
        getAgentGroups(),
      ]);
      const activeID = sessionID || storedID || "";
      const active = sessions.find((item) => item.id === activeID) || null;
      setSession(active);
      setSessions(sessions);
      setWorkspace(active?.connector_workspace_path || "");
      setCatalog(channelItems);
      setAgents(agentItems);
      setGroups(groupItems);
      setSkills(skillItems);
      setMCPServers((settings.mcp_servers || []).filter((server) => server.enabled !== false));
      setDevices(deviceItems);
    } catch (err) {
      Alert.alert("加载失败", err instanceof Error ? err.message : "无法读取会话设置。");
    } finally {
      setLoading(false);
    }
  }, [sessionID]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const update = async (patch: Partial<ChatSession>) => {
    if (!session) return;
    const next = { ...session, ...patch, updated_at: new Date().toISOString() };
    setSession(next);
    try {
      const saved = await saveSession(next);
      setSession(saved);
      await AsyncStorage.setItem(selectedSessionKey, saved.id);
    } catch (err) {
      Alert.alert("保存失败", err instanceof Error ? err.message : "无法保存当前会话设置。");
      setSession(session);
    }
  };

  const recentWorkspacePaths = Array.from(new Set(
    sessions
      .filter((item) => item.connector_workspace_path && (!session?.connector_device_id || item.connector_device_id === session.connector_device_id))
      .map((item) => item.connector_workspace_path || "")
      .filter(Boolean)
  )).slice(0, 6);

  return { session, catalog, agents, groups, skills, mcpServers, devices, workspace, setWorkspace, loading, update, recentWorkspacePaths };
}

function NavRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, pressed && styles.rowPressed]}>
      <Text style={styles.navTitle}>{title}</Text>
      <Text numberOfLines={1} style={styles.navValue}>{value}</Text>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

function SelectRow({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.selectRow, selected && styles.selectRowSelected, pressed && styles.rowPressed]}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
    </Pressable>
  );
}

function AddRow({ title, subtitle, added, onPress }: { title: string; subtitle?: string; added?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.selectRow, pressed && styles.rowPressed]}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Text style={[styles.badge, added && styles.removeBadge]}>{added ? "移除" : "添加"}</Text>
    </Pressable>
  );
}

function SwitchRow({ title, value, onValueChange }: { title: string; value?: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.selectRow}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Switch value={Boolean(value)} onValueChange={onValueChange} />
    </View>
  );
}

function updateMode(session: ChatSession, mode: ChatRunMode, update: (patch: Partial<ChatSession>) => void) {
  update({
    run_mode: mode,
    ...(mode === "agent_group" ? { agent_id: undefined, agent_group_id: session.agent_group_id || "" } : { agent_id: session.agent_id || "default", agent_group_id: "" }),
    ...(mode === "chat" ? { connector_device_id: undefined, connector_workspace_path: undefined, connector_auto_approve: false, connector_command_prefixes: [] } : {}),
  });
}

function agentSelectionPatch(agent: ChatAgent, catalog: UserChannelCatalog[], currentModel?: string): Partial<ChatSession> {
  const channel = agent.user_channel_id ? catalog.find((item) => item.id === agent.user_channel_id) : undefined;
  return {
    agent_id: agent.id,
    user_channel_id: agent.user_channel_id || undefined,
    model_name: agent.default_model || channel?.models?.[0] || currentModel || "",
  };
}

function toggleID(values: string[], id: string) {
  return values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
}

function removeID(values: string[], id: string) {
  return values.filter((item) => item !== id);
}

function modeLabel(mode: string) {
  if (mode === "assistant") return "助理";
  if (mode === "agent_group") return "工作室";
  return "聊天";
}

function channelName(catalog: UserChannelCatalog[], id?: number) {
  return catalog.find((item) => item.id === id)?.name || "未选择";
}

function agentName(agents: ChatAgent[], id?: string) {
  return agents.find((item) => item.id === (id || "default"))?.name || "默认助理";
}

function groupName(groups: ChatAgentGroup[], id?: string) {
  return groups.find((item) => item.id === id)?.name || "未选择";
}

function deviceName(devices: ConnectorDevice[], id?: string) {
  return devices.find((item) => item.id === id)?.name || "未选择";
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 10,
  },
  loading: {
    padding: 20,
    color: colors.muted,
    textAlign: "center",
  },
  summary: {
    color: colors.muted,
    fontWeight: "700",
    marginBottom: 4,
  },
  navRow: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navTitle: {
    color: colors.text,
    fontWeight: "900",
  },
  navValue: {
    flex: 1,
    textAlign: "right",
    color: colors.muted,
    fontWeight: "700",
  },
  selectRow: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectRowSelected: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
  },
  rowSub: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  badge: {
    overflow: "hidden",
    borderRadius: 7,
    backgroundColor: colors.primary,
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "900",
  },
  removeBadge: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  addButton: {
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 20,
  },
  recentBlock: {
    gap: 8,
  },
  recentTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  recentRow: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  recentPath: {
    color: colors.text,
    fontWeight: "700",
  },
});
