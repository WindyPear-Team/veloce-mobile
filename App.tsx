import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthContext } from "./src/api/auth";
import { getAuthToken, persistURLToken, tokenFromURL } from "./src/api/client";
import type { RootStackParamList } from "./src/types";
import { ChatScreen } from "./src/screens/ChatScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ServerScreen } from "./src/screens/ServerScreen";
import { SessionListScreen } from "./src/screens/SessionListScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { colors } from "./src/theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();

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
                <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "聊天" }} />
                <Stack.Screen name="Sessions" component={SessionListScreen} options={{ title: "会话" }} />
                <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "设置" }} />
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

