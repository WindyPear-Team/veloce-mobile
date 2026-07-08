import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Trash2 } from "lucide-react-native";
import { useContext, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../api/auth";
import { clearAuthToken, defaultServerURL, getAuthToken, getServerURL, normalizeServerURL, readServerList, removeServerURL, setServerURL } from "../api/client";
import { AppButton } from "../components/Button";
import { Field } from "../components/Field";
import { IconButton } from "../components/IconButton";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Server">;

export function ServerScreen({ navigation }: Props) {
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

  const add = async () => {
    await choose(normalizeServerURL(value));
    navigation.goBack();
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
      <Text style={styles.description}>移动端和桌面端一样按服务器保存登录状态。切换服务器后，会自动使用该服务器对应的 token。</Text>
      <Field label="服务器地址" value={value} onChangeText={setValue} placeholder={defaultServerURL} keyboardType="url" />
      <AppButton onPress={add}>使用此服务器</AppButton>
      {auth.token ? <AppButton variant="secondary" onPress={logout}>退出当前服务器登录</AppButton> : null}

      <View style={styles.list}>
        <Text style={styles.sectionTitle}>已保存服务器</Text>
        {servers.map((server) => {
          const selected = server === current;
          return (
            <Pressable key={server} onPress={() => choose(server)} style={[styles.server, selected && styles.selected]}>
              <View style={styles.serverCopy}>
                <Text numberOfLines={1} style={styles.serverTitle}>{server}</Text>
                <Text style={styles.serverSubtitle}>{selected ? "当前服务器" : "点击切换"}</Text>
              </View>
              <IconButton icon={Trash2} label="删除服务器" color={colors.danger} onPress={() => {
                Alert.alert("删除服务器", server, [
                  { text: "取消", style: "cancel" },
                  { text: "删除", style: "destructive", onPress: () => void remove(server) },
                ]);
              }} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 14,
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
  },
  list: {
    marginTop: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "800",
  },
  server: {
    minHeight: 68,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  serverCopy: {
    flex: 1,
    minWidth: 0,
  },
  serverTitle: {
    color: colors.text,
    fontWeight: "800",
  },
  serverSubtitle: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
  },
});

