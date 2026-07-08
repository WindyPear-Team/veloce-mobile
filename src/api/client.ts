import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";

export const defaultServerURL = Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080";

const activeServerKey = "veloce.mobile.server_url";
const serverListKey = "veloce.mobile.servers";
const tokenPrefix = "veloce.mobile.server_token.";

export class APIError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeServerURL(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return defaultServerURL;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return defaultServerURL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return defaultServerURL;
  }
}

export async function getServerURL() {
  return normalizeServerURL(await AsyncStorage.getItem(activeServerKey));
}

function tokenKey(serverURL: string) {
  return `${tokenPrefix}${encodeURIComponent(normalizeServerURL(serverURL))}`;
}

export async function getAuthToken(serverURL?: string) {
  const url = serverURL ? normalizeServerURL(serverURL) : await getServerURL();
  return (await AsyncStorage.getItem(tokenKey(url))) || "";
}

export async function setAuthToken(token: string, serverURL?: string) {
  const url = serverURL ? normalizeServerURL(serverURL) : await getServerURL();
  if (token) {
    await AsyncStorage.setItem(tokenKey(url), token);
  } else {
    await AsyncStorage.removeItem(tokenKey(url));
  }
}

export async function clearAuthToken(serverURL?: string) {
  await setAuthToken("", serverURL);
}

export async function readServerList() {
  const current = await getServerURL();
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(serverListKey)) || "[]");
    const values = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    return Array.from(new Set([current, ...values.map(normalizeServerURL)]));
  } catch {
    return [current];
  }
}

export async function writeServerList(values: string[]) {
  await AsyncStorage.setItem(serverListKey, JSON.stringify(Array.from(new Set(values.map(normalizeServerURL)))));
}

export async function setServerURL(value: string) {
  const nextURL = normalizeServerURL(value);
  const servers = await readServerList();
  await AsyncStorage.setItem(activeServerKey, nextURL);
  await writeServerList([nextURL, ...servers]);
  return nextURL;
}

export async function removeServerURL(value: string) {
  const normalized = normalizeServerURL(value);
  const current = await getServerURL();
  const servers = (await readServerList()).filter((item) => item !== normalized);
  await AsyncStorage.removeItem(tokenKey(normalized));
  if (current === normalized) {
    await AsyncStorage.setItem(activeServerKey, servers[0] || defaultServerURL);
  }
  await writeServerList(servers.length ? servers : [defaultServerURL]);
}

async function request<T>(path: string, init: RequestInit = {}, apiPrefix = true): Promise<T> {
  const serverURL = await getServerURL();
  const token = await getAuthToken(serverURL);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${serverURL}${apiPrefix ? "/api" : ""}${normalizedPath}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const body = text ? tryJSON(text) : null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new APIError(message, response.status);
  }
  return body as T;
}

export function apiRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, init, true);
}

export async function apiURL(path: string) {
  const serverURL = await getServerURL();
  return `${serverURL}/api${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, init, false);
}

export async function passwordLogin(identifier: string, password: string) {
  const result = await publicRequest<{ token: string }>("/auth/password/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password, agreement_accepted: true }),
  });
  await setAuthToken(result.token);
  return result.token;
}

export function tokenFromURL() {
  return "";
}

export async function persistURLToken(token: string) {
  await setAuthToken(token);
}

export async function openExternalURL(path: string) {
  const serverURL = await getServerURL();
  await Linking.openURL(`${serverURL}${path.startsWith("/") ? path : `/${path}`}`);
}

function tryJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
