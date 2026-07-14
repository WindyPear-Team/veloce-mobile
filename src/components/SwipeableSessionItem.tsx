import { Settings, Trash2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

const actionWidth = 72;
const revealWidth = actionWidth * 2;

export function SwipeableSessionItem({
  children,
  contentStyle,
  onPress,
  onLongPress,
  onSettings,
  onDelete,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const actionOpacity = translateX.interpolate({
    inputRange: [-revealWidth, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const settle = (open: boolean) => {
    const target = open ? -revealWidth : 0;
    offsetRef.current = target;
    Animated.spring(translateX, { toValue: target, useNativeDriver: true, stiffness: 280, damping: 28, mass: 0.55 }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      translateX.stopAnimation((value) => {
        offsetRef.current = value;
      });
    },
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(Math.max(-revealWidth, Math.min(0, offsetRef.current + gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      settle(offsetRef.current + gesture.dx < -revealWidth / 2 || gesture.vx < -0.35);
    },
    onPanResponderTerminate: () => settle(false),
  }), [translateX]);

  const runAction = (action: () => void) => {
    settle(false);
    action();
  };

  return (
    <Animated.View style={styles.root}>
      <Animated.View pointerEvents="box-none" style={[styles.actions, { opacity: actionOpacity }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="会话设置" onPress={() => runAction(onSettings)} style={[styles.action, styles.settingsAction]}>
          <Settings size={18} color="#fff" />
          <Text style={styles.actionText}>设置</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="删除会话" onPress={() => runAction(onDelete)} style={[styles.action, styles.deleteAction]}>
          <Trash2 size={18} color="#fff" />
          <Text style={styles.actionText}>删除</Text>
        </Pressable>
      </Animated.View>
      <Animated.View {...panResponder.panHandlers} style={[styles.contentMotion, { transform: [{ translateX }] }]}>
        <Pressable onPress={() => { settle(false); onPress(); }} onLongPress={onLongPress} style={contentStyle}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    overflow: "hidden",
  },
  contentMotion: {
    width: "100%",
  },
  actions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
    backgroundColor: colors.surfaceMuted,
  },
  action: {
    width: actionWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  settingsAction: {
    backgroundColor: "#2563eb",
  },
  deleteAction: {
    backgroundColor: colors.danger,
  },
  actionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
});
