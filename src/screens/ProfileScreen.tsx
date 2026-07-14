import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { UserRound } from "lucide-react-native";
import { useCallback, useContext, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../api/auth";
import { clearAuthToken, getServerURL } from "../api/client";
import { getCurrentUser } from "../api/chat";
import { AppButton } from "../components/Button";
import { colors } from "../theme/colors";
import type { MainTabParamList } from "../types";

type Props = BottomTabScreenProps<MainTabParamList, "Profile">;

export function ProfileScreen(_props: Props) {
  const auth = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [server, setServer] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, serverURL] = await Promise.all([getCurrentUser(), getServerURL()]);
      setUsername(user.username || "当前用户");
      setEmail(user.email || "");
      setServer(serverURL);
    } catch (err) {
      Alert.alert("加载失败", err instanceof Error ? err.message : "无法读取账户信息。");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const logout = async () => {
    try {
      await clearAuthToken();
      auth.setToken("");
    } catch (err) {
      Alert.alert("退出失败", err instanceof Error ? err.message : "无法退出当前登录。");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><UserRound size={34} color="#fff" /></View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={styles.name}>{username || "正在加载..."}</Text>
          {email ? <Text numberOfLines={1} style={styles.email}>{email}</Text> : null}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>当前服务器</Text>
        <Text selectable style={styles.server}>{server || "正在加载..."}</Text>
      </View>

      <View style={styles.panel}>
        <AppButton variant="secondary" onPress={() => void load()} disabled={loading}>
          {loading ? "刷新中" : "刷新账户信息"}
        </AppButton>
        <AppButton variant="secondary" onPress={logout}>
          退出登录
        </AppButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 14,
  },
  profileCard: {
    minHeight: 104,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  email: {
    color: colors.muted,
    fontSize: 13,
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
    fontSize: 15,
    fontWeight: "900",
  },
  server: {
    color: colors.muted,
    lineHeight: 20,
  },
});
