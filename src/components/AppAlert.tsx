import React from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { AppTheme } from '../theme/tokens';
import { useAppTheme } from '../theme/ThemeContext';

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  // cancel = 加粗的取消项；destructive = 红色危险项；default = 主色调确认项。
  style?: 'cancel' | 'default' | 'destructive';
};

export type AppAlertConfig = {
  title: string;
  message?: string;
  buttons?: AppAlertButton[];
};

// 模块级队列：任何组件直接调用 showAlert，不需要层层透传 props / context。
// AppAlertHost 挂载在 App 根部，按 iOS 的方式逐条弹出（排队展示）。
const queue: AppAlertConfig[] = [];
let pumpRef: (() => void) | null = null;

export function showAlert(config: AppAlertConfig) {
  queue.push(config);
  pumpRef?.();
}

// 按钮文字配色：取消项加粗用正文色，危险项用主题红，其余用主色调（iOS 蓝的位置）。
function buttonTextStyle(style: AppAlertButton['style'] | undefined, theme: AppTheme): TextStyle {
  if (style === 'destructive') return { color: theme.red };
  if (style === 'cancel') return { color: theme.ink, fontWeight: '700' };
  return { color: theme.blue };
}

export function AppAlertHost({ fontFamily }: { fontFamily?: string }) {
  const theme = useAppTheme();
  const [current, setCurrent] = React.useState<AppAlertConfig | null>(null);
  const progress = React.useRef(new Animated.Value(0)).current;

  const pump = React.useCallback(() => {
    setCurrent((prev) => (prev ? prev : queue.shift() ?? null));
  }, []);

  React.useEffect(() => {
    pumpRef = pump;
    return () => {
      pumpRef = null;
    };
  }, [pump]);

  // 当前弹窗关闭后，队列里还有未弹出的就继续弹出下一条。
  React.useEffect(() => {
    if (current === null && queue.length > 0) pump();
  }, [current, pump]);

  const visible = current !== null;
  React.useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [progress, visible]);

  const dismiss = React.useCallback(() => setCurrent(null), []);

  const handlePress = React.useCallback((button: AppAlertButton) => {
    dismiss();
    button.onPress?.();
  }, [dismiss]);

  // 未提供按钮的提示框（如保存成功的「已保存」）自动补一个确定键：
  // 否则弹窗没有任何可点项，只能靠系统返回键关闭。
  const requestedButtons = current?.buttons ?? [];
  const buttons: AppAlertButton[] = requestedButtons.length > 0 ? requestedButtons : [{ text: '确定', style: 'default' }];
  const stacked = buttons.length > 2;

  // Android 返回键等同点击取消项；没有按钮时仅关闭（与 iOS 系统弹窗一致，点遮罩不关闭）。
  const requestClose = React.useCallback(() => {
    if (!current) return;
    const cancel = current.buttons?.find((button) => button.style === 'cancel') ?? current.buttons?.[0];
    if (cancel) handlePress(cancel);
    else dismiss();
  }, [current, dismiss, handlePress]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={requestClose}>
      <View style={styles.backdrop}>
        {current ? (
          <Animated.View
            style={[
              styles.box,
              { backgroundColor: theme.paperElevated, opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.14, 1] }) }] },
            ]}
          >
            <View style={styles.content}>
              <Text style={[styles.title, { color: theme.ink, fontFamily }]}>{current.title}</Text>
              {current.message ? <Text style={[styles.message, { color: theme.inkMuted, fontFamily }]}>{current.message}</Text> : null}
            </View>
            {stacked ? (
              <View style={[styles.buttonStack, { borderTopColor: theme.line }]}>
                {buttons.map((button, index) => (
                  <Pressable
                    key={`alert-button-${index}-${button.text}`}
                    accessibilityRole="button"
                    onPress={() => handlePress(button)}
                    style={({ pressed }) => [
                      styles.stackButton,
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line },
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={[styles.buttonText, { fontFamily }, buttonTextStyle(button.style, theme)]}>{button.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={[styles.buttonRow, { borderTopColor: theme.line }]}>
                {buttons.map((button, index) => (
                  <Pressable
                    key={`alert-button-${index}-${button.text}`}
                    accessibilityRole="button"
                    onPress={() => handlePress(button)}
                    style={({ pressed }) => [
                      styles.rowButton,
                      index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.line },
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={[styles.buttonText, { fontFamily }, buttonTextStyle(button.style, theme)]}>{button.text}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)', padding: 32 },
  box: { width: '100%', maxWidth: 282, borderRadius: 16, overflow: 'hidden' },
  content: { alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 17 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 13, lineHeight: 19, fontWeight: '500', textAlign: 'center' },
  buttonRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  rowButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  buttonStack: { borderTopWidth: StyleSheet.hairlineWidth },
  stackButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 9 },
  buttonText: { fontSize: 16, lineHeight: 21, fontWeight: '500', textAlign: 'center' },
  buttonPressed: { backgroundColor: 'rgba(120,110,90,0.14)' },
});
