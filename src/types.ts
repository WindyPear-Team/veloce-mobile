export type RootStackParamList = {
  Login: undefined;
  Chat: { sessionID?: string } | undefined;
  Sessions: undefined;
  Settings: undefined;
  SessionSettings: { sessionID?: string } | undefined;
  SessionSettingDetail: { sessionID: string; section: "mode" | "channel" | "agent" | "studio" | "skills" | "mcp" | "connector" };
  SessionAddItems: { sessionID: string; type: "skills" | "mcp" };
  Server: undefined;
};

export type ChatRunMode = "chat" | "assistant" | "agent_group";

export interface UserChannelCatalog {
  id: number;
  name: string;
  models: string[];
  model_icons?: Record<string, string>;
}

export interface ChatToolCall {
  id?: string;
  round?: number;
  name: string;
  server?: string;
  tool?: string;
  status: string;
  arguments?: Record<string, unknown>;
  result?: string;
}

export interface ChatContentPart {
  round?: number;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  content_parts?: ChatContentPart[];
  created_at: string;
  updated_at?: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatAttachment {
  id: string;
  storage_id?: string;
  name: string;
  type: string;
  size: number;
  text?: string;
  binary?: boolean;
  truncated?: boolean;
}

export interface ChatRun {
  id: string;
  session_id: string;
  assistant_message_id: string;
  mode: ChatRunMode;
  status: string;
  status_message?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  run_mode: ChatRunMode;
  latest_run?: ChatRun;
  agent_id?: string;
  agent_group_id?: string;
  skill_ids: string[];
  mcp_server_ids: string[];
  connector_device_id?: string;
  connector_workspace_path?: string;
  connector_auto_approve: boolean;
  connector_command_prefixes: string[];
  model_name?: string;
  user_channel_id?: number;
  max_tokens?: number;
  temperature?: number | null;
  reasoning_effort?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatAgent {
  id: string;
  name: string;
  prompt?: string;
  default_model?: string;
  user_channel_id?: number;
  stream?: boolean;
}

export interface ChatSkill {
  id: string;
  name: string;
  description?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  type?: "http" | "connector" | string;
  url?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  request_mode?: string;
}

export interface ConnectorDevice {
  id: string;
  name: string;
  hostname?: string;
  status: string;
  online: boolean;
}

export interface ChatAgentGroup {
  id: string;
  name: string;
}

export interface AdvancedChatSettings {
  mcp_servers: MCPServer[];
  assistant_mode_enabled: boolean;
  assistant_mcp_tools_enabled: boolean;
}
