import { apiRequest } from "./client";
import type {
  AdvancedChatSettings,
  ChatAgent,
  ChatAgentGroup,
  ChatMessage,
  ChatRunMode,
  ChatSession,
  ChatSkill,
  ConnectorDevice,
  UserChannelCatalog,
} from "../types";

const selectedSessionKey = "veloce.mobile.selected_session";
const defaultAgentID = "default";

export async function getCurrentUser() {
  return apiRequest<{ username?: string; email?: string; is_admin?: boolean }>("/user/me");
}

export async function getCatalog() {
  return apiRequest<UserChannelCatalog[]>("/user/catalog");
}

export async function getAgents() {
  return apiRequest<ChatAgent[]>("/user/advanced-chat/agents");
}

export async function getSkills() {
  return apiRequest<ChatSkill[]>("/user/advanced-chat/skills");
}

export async function getMCPSettings() {
  return apiRequest<AdvancedChatSettings>("/user/advanced-chat/settings");
}

export async function getSessions() {
  const sessions = await apiRequest<ChatSession[]>("/user/advanced-chat/sessions");
  return Array.isArray(sessions) ? sessions.map(normalizeSession).filter(Boolean) as ChatSession[] : [];
}

export async function getDevices() {
  return apiRequest<ConnectorDevice[]>("/user/advanced-chat/devices");
}

export async function getAgentGroups() {
  return apiRequest<ChatAgentGroup[]>("/user/advanced-chat/agent-groups");
}

export async function saveSession(session: ChatSession) {
  return apiRequest<ChatSession>(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    body: JSON.stringify(sessionPayload(session)),
  });
}

export async function deleteSession(sessionID: string) {
  return apiRequest<{ message: string }>(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}`, { method: "DELETE" });
}

export async function stopRun(runID: string) {
  return apiRequest(`/user/advanced-chat/runs/${encodeURIComponent(runID)}/stop`, { method: "POST" });
}

export async function completeSession(session: ChatSession, messages: ChatMessage[]) {
  const isStudio = session.run_mode === "agent_group";
  return apiRequest<{ session?: ChatSession; message?: ChatMessage; tool_call_details?: unknown[] }>("/user/advanced-chat/completions", {
    method: "POST",
    body: JSON.stringify({
      session_id: session.id,
      title: session.title || titleFromMessages(messages),
      model: isStudio ? "" : session.model_name || "",
      user_channel_id: session.user_channel_id || 0,
      mode: session.run_mode,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        content_parts: message.content_parts || [],
        tool_calls: message.tool_calls || [],
      })),
      agent_id: isStudio ? "" : session.agent_id || defaultAgentID,
      agent_group_id: session.agent_group_id || "",
      skill_ids: session.skill_ids || [],
      mcp_server_ids: session.mcp_server_ids || [],
      connector_device_id: session.run_mode === "chat" ? "" : session.connector_device_id || "",
      connector_workspace_path: session.run_mode === "chat" ? "" : session.connector_workspace_path || "",
      connector_auto_approve: session.run_mode === "chat" ? false : session.connector_auto_approve,
      connector_command_prefixes: session.run_mode === "chat" ? [] : session.connector_command_prefixes || [],
      max_tokens: session.max_tokens || 0,
      temperature: session.temperature ?? null,
      reasoning_effort: session.reasoning_effort || "",
      stream: false,
    }),
  });
}

export function createSession(input: Partial<ChatSession> = {}): ChatSession {
  const now = new Date().toISOString();
  return {
    id: input.id || createID("acs"),
    title: input.title || "",
    messages: input.messages || [],
    run_mode: input.run_mode || "chat",
    agent_id: input.agent_id || defaultAgentID,
    agent_group_id: input.agent_group_id,
    skill_ids: input.skill_ids || [],
    mcp_server_ids: input.mcp_server_ids || [],
    connector_device_id: input.connector_device_id,
    connector_workspace_path: input.connector_workspace_path,
    connector_auto_approve: input.connector_auto_approve || false,
    connector_command_prefixes: input.connector_command_prefixes || [],
    model_name: input.model_name,
    user_channel_id: input.user_channel_id,
    max_tokens: input.max_tokens || 0,
    temperature: input.temperature ?? null,
    reasoning_effort: input.reasoning_effort || "",
    created_at: input.created_at || now,
    updated_at: input.updated_at || now,
  };
}

export function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: createID("acm"),
    role,
    content,
    content_parts: content.trim() ? [{ round: 1, content }] : [],
    tool_calls: [],
    created_at: new Date().toISOString(),
  };
}

export function isRunActive(session?: ChatSession) {
  const status = session?.latest_run?.status;
  return status === "queued" || status === "running";
}

export function titleFromMessages(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  const title = latest?.content.replace(/\s+/g, " ").trim() || "新会话";
  return title.slice(0, 28);
}

export { selectedSessionKey };

function normalizeSession(value: ChatSession): ChatSession {
  return createSession({
    ...value,
    messages: Array.isArray(value.messages) ? value.messages : [],
    skill_ids: Array.isArray(value.skill_ids) ? value.skill_ids : [],
    mcp_server_ids: Array.isArray(value.mcp_server_ids) ? value.mcp_server_ids : [],
    connector_command_prefixes: Array.isArray(value.connector_command_prefixes) ? value.connector_command_prefixes : [],
  });
}

function sessionPayload(session: ChatSession) {
  const isStudio = session.run_mode === "agent_group";
  const isChat = session.run_mode === "chat";
  return {
    id: session.id,
    title: session.title || titleFromMessages(session.messages),
    run_mode: session.run_mode,
    agent_id: isStudio ? "" : session.agent_id || defaultAgentID,
    agent_group_id: isStudio ? session.agent_group_id || "" : "",
    skill_ids: session.skill_ids || [],
    mcp_server_ids: session.mcp_server_ids || [],
    connector_device_id: isChat ? "" : session.connector_device_id || "",
    connector_workspace_path: isChat ? "" : session.connector_workspace_path || "",
    connector_auto_approve: isChat ? false : session.connector_auto_approve,
    connector_command_prefixes: isChat ? [] : session.connector_command_prefixes || [],
    model_name: isStudio ? "" : session.model_name || "",
    user_channel_id: session.user_channel_id || 0,
    max_tokens: session.max_tokens || 0,
    temperature: session.temperature ?? null,
    reasoning_effort: session.reasoning_effort || "",
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      content_parts: message.content_parts || [],
      tool_calls: message.tool_calls || [],
    })),
  };
}

function createID(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

