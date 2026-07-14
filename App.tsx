import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { List, MessageSquare, Settings, UserRound } from "lucide-react-native";
import { AuthContext } from "./src/api/auth";
import { getAuthToken, persistURLToken, tokenFromURL } from "./src/api/client";
import { decideConnectorTask, getPendingConnectorApprovals, getSessions } from "./src/api/chat";
import type { MainTabParamList, RootStackParamList } from "./src/types";
import { ChatScreen } from "./src/screens/ChatScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ServerScreen } from "./src/screens/ServerScreen";
import { SessionListScreen } from "./src/screens/SessionListScreen";
import { SessionAddItemsScreen, SessionSettingDetailScreen, SessionSettingsScreen } from "./src/screens/SessionSettingsV2";
import { ClientSettingsScreen } from "./src/screens/ClientSettingsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { colors } from "./src/theme/colors";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

export default function App() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const bridged = tokenFromURL();
      if (bridged) {
        await persistURLToken(bridged);
      }
      const stored = await getAuthToken();
      if (mounted) {
        setToken(stored);
        setReady(true);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const authValue = useMemo(() => ({ token, setToken }), [token]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={authValue}>
        <NavigationContainer>
          <StatusBar style="dark" />
          {token ? <TaskMonitor /> : null}
          <Stack.Navigator
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {token ? (
              <>
                <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
                <Stack.Screen name="SessionSettings" component={SessionSettingsScreen} options={{ title: "会话设置" }} />
                <Stack.Screen name="SessionSettingDetail" component={SessionSettingDetailScreen} options={{ title: "设置项" }} />
                <Stack.Screen name="SessionAddItems" component={SessionAddItemsScreen} options={{ title: "添加" }} />
                <Stack.Screen name="Server" component={ServerScreen} options={{ title: "服务器" }} />
              </>
            ) : (
              <>
                <Stack.Screen name="Login" component={LoginScreen} options={{ title: "登录" }} />
                <Stack.Screen name="Server" component={ServerScreen} options={{ title: "服务器" }} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ color, size, focused }) => {
          const Icon = route.name === "Chat" ? MessageSquare : route.name === "Sessions" ? List : route.name === "Settings" ? Settings : UserRound;
          return <Icon size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
        },
      })}
    >
      <Tabs.Screen name="Chat" component={ChatScreen} options={{ title: "聊天", tabBarLabel: "聊天" }} />
      <Tabs.Screen name="Sessions" component={SessionListScreen} options={{ title: "会话", tabBarLabel: "会话" }} />
      <Tabs.Screen name="Settings" component={ClientSettingsScreen} options={{ title: "设置", tabBarLabel: "设置" }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: "我的", tabBarLabel: "我的" }} />
    </Tabs.Navigator>
  );
}

function TaskMonitor() {
  const statesRef = useRef(new Map<string, string>());
  const approvalNotificationIDsRef = useRef(new Map<string, string>());
  const initializedRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const configure = async () => {
      await Notifications.requestPermissionsAsync();
      await Notifications.setNotificationCategoryAsync("connector-approval", [
        { identifier: "approve", buttonTitle: "批准", options: { opensAppToForeground: true } },
        { identifier: "reject", buttonTitle: "拒绝", options: { opensAppToForeground: true } },
      ]);
    };
    void configure();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { taskID?: string };
      if (!data.taskID) return;
      const decide = async (approved: boolean) => {
        await decideConnectorTask(data.taskID!, approved);
        await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
        approvalNotificationIDsRef.current.delete(data.taskID!);
      };
      if (response.actionIdentifier === "approve") void decide(true);
      if (response.actionIdentifier === "reject") void decide(false);
    });
    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const sessions = await getSessions();
        const pendingApprovalIDs = new Set<string>();
        for (const session of sessions) {
          const previous = statesRef.current.get(session.id);
          const current = session.latest_run?.status || "";
          statesRef.current.set(session.id, current);
          const wasActive = previous === "queued" || previous === "running" || previous === "pending_approval";
          const isActive = current === "queued" || current === "running" || current === "pending_approval";
          if (initializedRef.current && wasActive && !isActive && current && active) {
            await Notifications.scheduleNotificationAsync({ content: { title: "任务已完成", body: session.title || "聊天任务", data: { sessionID: session.id } }, trigger: null });
          }
          if ((current === "running" || current === "pending_approval") && session.latest_run?.id) {
            const tasks = await getPendingConnectorApprovals(session.latest_run.id).catch(() => []);
            for (const task of tasks) {
              pendingApprovalIDs.add(task.id);
              if (!approvalNotificationIDsRef.current.has(task.id) && active) {
                const notificationID = await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "需要审批",
                    body: `${task.device_name || "设备"}：${task.action || "连接器操作"}`,
                    categoryIdentifier: "connector-approval",
                    data: { taskID: task.id, sessionID: session.id },
                  },
                  trigger: null,
                });
                approvalNotificationIDsRef.current.set(task.id, notificationID);
              }
            }
          }
        }
        for (const [taskID, notificationID] of approvalNotificationIDsRef.current) {
          if (!pendingApprovalIDs.has(taskID)) {
            await Notifications.dismissNotificationAsync(notificationID).catch(() => undefined);
            approvalNotificationIDsRef.current.delete(taskID);
          }
        }
        initializedRef.current = true;
      } catch {
        // A later poll will recover after transient network failures.
      } finally {
        pollingRef.current = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  return null;
}
