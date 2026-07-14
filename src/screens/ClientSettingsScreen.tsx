import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useContext, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../api/auth";
import { clearAuthToken, defaultServerURL, getAuthToken, getServerURL, normalizeServerURL, readServerList, removeServerURL, setServerURL } from "../api/client";
import { AppButton } from "../components/Button";
import { Field } from "../components/Field";
import { colors } from "../theme/colors";
import type { MainTabParamList, RootStackParamList } from "../types";

type Props = BottomTabScreenProps<MainTabParamList, "Settings"> & Pick<NativeStackScreenProps<RootStackParamList>, "navigation">;

export function ClientSettingsScreen({ navigation }: Props) {
  const auth = useContext(AuthContext);
  const [current, setCurrent] = useState(defaultServerURL);
  const [servers, setServers] = useState<string[]>([]);
  const [value, setValue] = useState(defaultServerURL);

  const refresh = async () => {
    const url = await getServerURL();
    setCurrent(url);
    setValue(url);
    setServers(await readServerList());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const choose = async (url: string) => {
    const next = await setServerURL(url);
    setCurrent(next);
    setValue(next);
    setServers(await readServerList());
    auth.setToken(await getAuthToken(next));
  };

  const logout = async () => {
    await clearAuthToken(current);
    auth.setToken("");
  };

  const remove = async (url: string) => {
    await removeServerURL(url);
    await refresh();
    auth.setToken(await getAuthToken());
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.title}>服务器</Text>
        <Text style={styles.caption}>切换服务器会自动切换该服务器保存的登录状态。</Text>
        <Field label="地址" value={value} onChangeText={setValue} placeholder={defaultServerURL} keyboardType="url" />
        <View style={styles.actions}>
          <AppButton onPress={() => choose(normalizeServerURL(value))} style={styles.action}>使用</AppButton>
          <AppButton variant="secondary" onPress={() => navigation.navigate("Server")} style={styles.action}>管理</AppButton>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>已保存服务器</Text>
        {servers.map((server) => {
          const selected = server === current;
          return (
            <Pressable
              key={server}
              onPress={() => choose(server)}
              onLongPress={() => {
                Alert.alert("服务器", server, [
                  { text: "取消", style: "cancel" },
                  { text: "删除", style: "destructive", onPress: () => void remove(server) },
                ]);
              }}
              style={[styles.server, selected && styles.selected]}
            >
              <Text numberOfLines={1} style={styles.serverTitle}>{server}</Text>
              <Text style={styles.serverSub}>{selected ? "当前服务器" : "点击切换，长按删除"}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>账号</Text>
        {auth.token ? <AppButton variant="secondary" onPress={logout}>退出当前服务器登录</AppButton> : <Text style={styles.caption}>当前服务器未登录。</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 14,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  caption: {
    color: colors.muted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
  },
  server: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  serverTitle: {
    color: colors.text,
    fontWeight: "800",
  },
  serverSub: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
  },
});
