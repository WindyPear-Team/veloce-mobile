import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check, ChevronDown, ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getAgentGroups, getAgents, getCatalog, getDevices, getMCPSettings, getSessions, getSkills, saveSession, selectedSessionKey } from "../api/chat";
import { Field } from "../components/Field";
import { colors } from "../theme/colors";
import type { ChatAgent, ChatAgentGroup, ChatRunMode, ChatSession, ChatSkill, ConnectorDevice, MCPServer, RootStackParamList, UserChannelCatalog } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "SessionSettings">;
type SectionKey = "mode" | "model" | "agent" | "tools" | "connector";

export function SessionSettingsScreen({ route }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [catalog, setCatalog] = useState<UserChannelCatalog[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<ChatAgentGroup[]>([]);
  const [skills, setSkills] = useState<ChatSkill[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServer[]>([]);
  const [devices, setDevices] = useState<ConnectorDevice[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ mode: true, model: false, agent: false, tools: false, connector: false });
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
      const activeID = route.params?.sessionID || storedID || "";
      const active = sessions.find((item) => item.id === activeID) || sessions[0] || null;
      setSession(active);
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
  }, [route.params?.sessionID]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const models = useMemo(() => Array.from(new Set(catalog.flatMap((item) => item.models || []))), [catalog]);

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

  if (loading && !session) return <Text style={styles.loading}>正在加载...</Text>;
  if (!session) return <Text style={styles.loading}>请先创建或选择一个会话。</Text>;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.summary}>{session.title || "新会话"} · {modeLabel(session.run_mode)}</Text>
      <Collapsible title="运行模式" open={open.mode} onToggle={() => toggleOpen(setOpen, "mode")}>
        <SelectRow title="聊天" subtitle="普通对话" selected={session.run_mode === "chat"} onPress={() => updateMode(session, "chat", update)} />
        <SelectRow title="助理模式" subtitle="工具、技能、MCP 和连接器" selected={session.run_mode === "assistant"} onPress={() => updateMode(session, "assistant", update)} />
        <SelectRow title="工作室模式" subtitle="多代理协作" selected={session.run_mode === "agent_group"} onPress={() => updateMode(session, "agent_group", update)} />
      </Collapsible>

      {session.run_mode !== "agent_group" ? (
        <>
          <Collapsible title={`模型 · ${session.model_name || "未选择"}`} open={open.model} onToggle={() => toggleOpen(setOpen, "model")}>
            {models.map((model) => <SelectRow key={model} title={model} selected={session.model_name === model} onPress={() => update({ model_name: model })} />)}
            {models.length === 0 ? <Text style={styles.empty}>当前账号还没有可用模型</Text> : null}
          </Collapsible>
          <Collapsible title={`渠道/助理 · ${channelName(catalog, session.user_channel_id)}`} open={open.agent} onToggle={() => toggleOpen(setOpen, "agent")}>
            {catalog.map((channel) => <SelectRow key={channel.id} title={channel.name} subtitle={(channel.models || []).join(", ")} selected={session.user_channel_id === channel.id} onPress={() => update({ user_channel_id: channel.id })} />)}
            <View style={styles.divider} />
            {agents.map((agent) => <SelectRow key={agent.id} title={agent.name || agent.id} subtitle={agent.default_model || "助理"} selected={(session.agent_id || "default") === agent.id} onPress={() => update({ agent_id: agent.id })} />)}
          </Collapsible>
        </>
      ) : (
        <Collapsible title={`工作室 · ${groupName(groups, session.agent_group_id)}`} open={open.agent} onToggle={() => toggleOpen(setOpen, "agent")}>
          {groups.map((group) => <SelectRow key={group.id} title={group.name || group.id} selected={session.agent_group_id === group.id} onPress={() => update({ agent_group_id: group.id })} />)}
        </Collapsible>
      )}

      <Collapsible title={`技能/MCP · ${(session.skill_ids?.length || 0) + (session.mcp_server_ids?.length || 0)} 项`} open={open.tools} onToggle={() => toggleOpen(setOpen, "tools")}>
        {skills.map((skill) => (
          <AddRow
            key={skill.id}
            title={skill.name}
            subtitle={skill.description || "技能"}
            added={session.skill_ids?.includes(skill.id)}
            onPress={() => toggleID(session.skill_ids || [], skill.id, (ids) => update({ skill_ids: ids }))}
          />
        ))}
        {skills.length && mcpServers.length ? <View style={styles.divider} /> : null}
        {mcpServers.map((server) => (
          <AddRow
            key={server.id}
            title={server.name}
            subtitle={server.type === "connector" ? server.command || "connector" : server.url || "MCP"}
            added={session.mcp_server_ids?.includes(server.id)}
            onPress={() => toggleID(session.mcp_server_ids || [], server.id, (ids) => update({ mcp_server_ids: ids }))}
          />
        ))}
        {skills.length === 0 && mcpServers.length === 0 ? <Text style={styles.empty}>还没有可添加的技能或 MCP</Text> : null}
      </Collapsible>

      <Collapsible title={`连接器 · ${deviceName(devices, session.connector_device_id)}`} open={open.connector} onToggle={() => toggleOpen(setOpen, "connector")}>
        {devices.map((device) => <SelectRow key={device.id} title={device.name || device.id} subtitle={device.online ? "在线" : device.status || "离线"} selected={session.connector_device_id === device.id} onPress={() => update({ connector_device_id: session.connector_device_id === device.id ? undefined : device.id })} />)}
        <Field label="工作目录" value={workspace} onChangeText={setWorkspace} onBlur={() => update({ connector_workspace_path: workspace.trim() })} placeholder="D:\\dev\\project 或 /Users/me/project" />
        <SwitchRow title="自动批准连接器任务" value={session.connector_auto_approve} onValueChange={(value) => update({ connector_auto_approve: value })} />
      </Collapsible>
    </ScrollView>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <View style={styles.panel}>
      <Pressable onPress={onToggle} style={styles.panelHeader}>
        <Text numberOfLines={1} style={styles.panelTitle}>{title}</Text>
        <Icon size={18} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.panelBody}>{children}</View> : null}
    </View>
  );
}

function SelectRow({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.selectRow, selected && styles.selectRowSelected, pressed && styles.rowPressed]}>
      <View style={styles.switchCopy}>
        <Text numberOfLines={1} style={styles.switchTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.switchSub}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function AddRow({ title, subtitle, added, onPress }: { title: string; subtitle?: string; added?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.addRow, added && styles.addRowAdded, pressed && styles.rowPressed]}>
      <View style={styles.switchCopy}>
        <Text numberOfLines={1} style={styles.switchTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.switchSub}>{subtitle}</Text> : null}
      </View>
      <Text style={[styles.addBadge, added && styles.removeBadge]}>{added ? "移除" : "添加"}</Text>
    </Pressable>
  );
}

function SwitchRow({ title, subtitle, value, onValueChange }: { title: string; subtitle?: string; value?: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text numberOfLines={1} style={styles.switchTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.switchSub}>{subtitle}</Text> : null}
      </View>
      <Switch value={Boolean(value)} onValueChange={onValueChange} />
    </View>
  );
}

function toggleOpen(setOpen: React.Dispatch<React.SetStateAction<Record<SectionKey, boolean>>>, key: SectionKey) {
  setOpen((value) => ({ ...value, [key]: !value[key] }));
}

function updateMode(session: ChatSession, mode: ChatRunMode, update: (patch: Partial<ChatSession>) => void) {
  update({
    run_mode: mode,
    ...(mode === "agent_group" ? { agent_id: undefined, agent_group_id: session.agent_group_id || "" } : { agent_id: session.agent_id || "default", agent_group_id: "" }),
    ...(mode === "agent_group" ? { model_name: "" } : { model_name: session.model_name || "" }),
    ...(mode === "chat" ? { connector_device_id: undefined, connector_workspace_path: undefined, connector_auto_approve: false, connector_command_prefixes: [] } : {}),
  });
}

function toggleID(values: string[], id: string, apply: (ids: string[]) => void) {
  apply(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
}

function modeLabel(mode: string) {
  if (mode === "assistant") return "助理";
  if (mode === "agent_group") return "工作室";
  return "聊天";
}

function channelName(catalog: UserChannelCatalog[], id?: number) {
  return catalog.find((item) => item.id === id)?.name || "未选择";
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
    gap: 12,
  },
  loading: {
    padding: 20,
    color: colors.muted,
    textAlign: "center",
  },
  summary: {
    color: colors.muted,
    fontWeight: "700",
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  panelHeader: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  panelTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "900",
  },
  panelBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 10,
    gap: 8,
  },
  switchRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  addRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  addRowAdded: {
    backgroundColor: "#f8fafc",
  },
  selectRowSelected: {
    backgroundColor: "#eff6ff",
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
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
  addBadge: {
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
  switchTitle: {
    color: colors.text,
    fontWeight: "800",
  },
  switchSub: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 10,
  },
});
