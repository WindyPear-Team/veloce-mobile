import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Server } from "lucide-react-native";
import { useContext, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../api/auth";
import { getServerURL, passwordLogin } from "../api/client";
import { AppButton } from "../components/Button";
import { Field } from "../components/Field";
import { IconButton } from "../components/IconButton";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const auth = useContext(AuthContext);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [serverURL, setServerURL] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getServerURL().then(setServerURL);
  }, []);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert("无法登录", "请输入账号和密码。");
      return;
    }
    setLoading(true);
    try {
      const token = await passwordLogin(identifier.trim(), password);
      auth.setToken(token);
    } catch (err) {
      Alert.alert("登录失败", err instanceof Error ? err.message : "请检查服务器和账号信息。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.mark}>
          <Text style={styles.markText}>W</Text>
        </View>
        <Text style={styles.title}>WindyPear</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{serverURL || "选择服务器后登录"}</Text>
      </View>

      <View style={styles.form}>
        <Field label="账号" value={identifier} onChangeText={setIdentifier} placeholder="用户名或邮箱" textContentType="username" />
        <Field label="密码" value={password} onChangeText={setPassword} placeholder="密码" secureTextEntry textContentType="password" />
        <AppButton loading={loading} onPress={submit}>登录</AppButton>
        <AppButton variant="secondary" onPress={() => navigation.navigate("Server")}>选择服务器</AppButton>
      </View>

      <View style={styles.footer}>
        <IconButton icon={Server} label="服务器" onPress={() => navigation.navigate("Server")} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
    gap: 8,
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    textAlign: "center",
  },
  form: {
    gap: 14,
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
});
