import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text } from "react-native";
import { getAgentGroups, getAgents, getCatalog, getDevices, getMCPSettings, getSessions, getSkills, saveSession, selectedSessionKey } from "../api/chat";
import { ChoiceList } from "../components/ChoiceList";
import { Field } from "../components/Field";
import { Section } from "../components/Section";
import { colors } from "../theme/colors";
import type { ChatAgent, ChatAgentGroup, ChatRunMode, ChatSession, ChatSkill, ConnectorDevice, MCPServer, RootStackParamList, UserChannelCatalog } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [catalog, setCatalog] = useState<UserChannelCatalog[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<ChatAgentGroup[]>([]);
  const [skills, setSkills] = useState<ChatSkill[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServer[]>([]);
  const [devices, setDevices] = useState<ConnectorDevice[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionID, sessions, channelItems, agentItems, skillItems, settings, deviceItems, groupItems] = await Promise.all([
        AsyncStorage.getItem(selectedSessionKey),
        getSessions(),
        getCatalog(),
        getAgents(),
        getSkills(),
        getMCPSettings(),
        getDevices(),
        getAgentGroups(),
      ]);
      const active = sessions.find((item) => item.id === sessionID) || sessions[0] || null;
      setSession(active);
      setWorkspace(active?.connector_workspace_path || "");
      setCatalog(channelItems);
      setAgents(agentItems);
      setGroups(groupItems);
      setSkills(skillItems);
      setMCPServers((settings.mcp_servers || []).filter((server) => server.enabled !== false));
      setDevices(deviceItems);
    } catch (err) {
      Alert.alert("加载失败", err instanceof Error ? err.message : "无法读取设置。");
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading && !session) {
    return <Text style={styles.loading}>正在加载...</Text>;
  }
  if (!session) {
    return <Text style={styles.loading}>请先创建或选择一个会话。</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Section title="运行模式">
        <ChoiceList
          selectedID={session.run_mode}
          onSelect={(id) => {
            const mode = id as ChatRunMode;
            void update({
              run_mode: mode,
              ...(mode === "agent_group" ? { agent_id: undefined, agent_group_id: session.agent_group_id || "" } : { agent_id: session.agent_id || "default", agent_group_id: "" }),
              ...(mode === "agent_group" ? { model_name: "" } : { model_name: session.model_name || "" }),
              ...(mode === "chat" ? { connector_device_id: undefined, connector_workspace_path: undefined, connector_auto_approve: false, connector_command_prefixes: [] } : {}),
            });
          }}
          items={[
            { id: "chat", title: "聊天", subtitle: "普通对话，使用单个模型和助理提示词。" },
            { id: "assistant", title: "助理模式", subtitle: "允许工具、技能、MCP 和连接器参与任务。" },
            { id: "agent_group", title: "工作室模式", subtitle: "使用工作室中的多个代理协作。" },
          ]}
        />
      </Section>

      {session.run_mode !== "agent_group" ? (
        <>
          <Section title="模型">
            <ChoiceList
              selectedID={session.model_name || ""}
              emptyText="当前账号还没有可用模型"
              onSelect={(model) => update({ model_name: model })}
              items={models.map((model) => ({ id: model, title: model }))}
            />
          </Section>
          <Section title="渠道">
            <ChoiceList
              selectedID={String(session.user_channel_id || "")}
              emptyText="当前账号还没有可用渠道"
              onSelect={(id) => update({ user_channel_id: Number(id) })}
              items={catalog.map((item) => ({ id: String(item.id), title: item.name, subtitle: (item.models || []).join(", ") }))}
            />
          </Section>
          <Section title="助理">
            <ChoiceList
              selectedID={session.agent_id || "default"}
              emptyText="还没有助理"
              onSelect={(id) => update({ agent_id: id })}
              items={agents.map((agent) => ({ id: agent.id, title: agent.name || agent.id, subtitle: agent.default_model || "" }))}
            />
          </Section>
        </>
      ) : (
        <Section title="工作室">
          <ChoiceList
            selectedID={session.agent_group_id || ""}
            emptyText="还没有工作室"
            onSelect={(id) => update({ agent_group_id: id })}
            items={groups.map((group) => ({ id: group.id, title: group.name || group.id }))}
          />
        </Section>
      )}

      <Section title="技能">
        <ChoiceList
          selectedID=""
          emptyText="还没有技能"
          onSelect={(id) => toggleID(session.skill_ids || [], id, (ids) => update({ skill_ids: ids }))}
          items={skills.map((skill) => ({ id: skill.id, title: `${session.skill_ids?.includes(skill.id) ? "✓ " : ""}${skill.name}`, subtitle: skill.description || skill.id }))}
        />
      </Section>

      <Section title="MCP">
        <ChoiceList
          selectedID=""
          emptyText="还没有可用 MCP"
          onSelect={(id) => toggleID(session.mcp_server_ids || [], id, (ids) => update({ mcp_server_ids: ids }))}
          items={mcpServers.map((server) => ({ id: server.id, title: `${session.mcp_server_ids?.includes(server.id) ? "✓ " : ""}${server.name}`, subtitle: server.type === "connector" ? server.command || "connector" : server.url || server.id }))}
        />
      </Section>

      <Section title="连接器">
        <ChoiceList
          selectedID={session.connector_device_id || ""}
          emptyText="还没有在线连接器"
          onSelect={(id) => update({ connector_device_id: id })}
          items={devices.map((device) => ({ id: device.id, title: device.name || device.id, subtitle: device.online ? "在线" : device.status || "离线" }))}
        />
        <Field
          label="工作目录"
          value={workspace}
          onChangeText={setWorkspace}
          onBlur={() => update({ connector_workspace_path: workspace.trim() })}
          placeholder="例如 D:\\dev\\project 或 /Users/me/project"
        />
        <Text style={styles.switchLabel}>自动批准连接器任务</Text>
        <Switch value={session.connector_auto_approve} onValueChange={(value) => update({ connector_auto_approve: value })} />
      </Section>
    </ScrollView>
  );
}

function toggleID(values: string[], id: string, apply: (ids: string[]) => void) {
  apply(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 22,
  },
  loading: {
    padding: 20,
    color: colors.muted,
    textAlign: "center",
  },
  switchLabel: {
    color: colors.text,
    fontWeight: "700",
  },
});
