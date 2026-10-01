import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef, captureScreen, releaseCapture } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius } from '../theme/tokens';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// captureRef 截图 hook：给目标视图挂 ref，调用 capture 即可拿到临时文件。
// captureRef 在 Fabric 上经 addUIBlock 的 interop 队列在下一次提交时执行，
// 因此调用后立即触发两次几乎不可见的透明度变化（kick），并带超时兜底；
// captureRef 失败时可选用整屏截图（captureScreen）兜底。
export function usePosterCapture() {
  const targetRef = React.useRef<View | null>(null);
  const [captureKick, setCaptureKick] = React.useState(0);

  const capture = React.useCallback(async (options?: { screenFallback?: boolean }): Promise<string | null> => {
    if (!targetRef.current) return null;
    const attempt = captureRef(targetRef.current, { format: 'png', quality: 1, result: 'tmpfile' }).then(
      (uri) => ({ ok: true as const, uri }),
      () => ({ ok: false as const }),
    );
    setCaptureKick((k) => k + 1);
    await nextFrame();
    await nextFrame();
    setCaptureKick((k) => k + 1);
    const raced = await Promise.race([attempt, sleep(2500).then(() => null)]);
    if (raced && raced.ok) return raced.uri;
    if (raced === null) {
      // 超时：迟到的结果直接丢弃，避免临时文件泄漏。
      void attempt.then((late) => {
        if (late.ok) releaseCapture(late.uri);
      });
    }
    if (options?.screenFallback === false) return null;
    try {
      return await captureScreen({ format: 'png', quality: 1, result: 'tmpfile' });
    } catch {
      return null;
    }
  }, []);

  return {
    targetRef,
    capture,
    // kick 用的透明度变化 1↔0.999 视觉上无差别，不影响截图内容。
    kickStyle: { opacity: captureKick % 2 === 1 ? 0.999 : 1 },
  };
}

export async function sharePosterFile(uri: string, title: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('当前设备不支持系统分享。');
  }
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title });
}

// 释放 view-shot 生成的临时文件（文件不存在时静默忽略）。
export function releasePosterTmp(uri: string | null): void {
  if (!uri) return;
  try {
    releaseCapture(uri);
  } catch {
    // 清理失败不影响分享结果。
  }
}

type ActionBusy = 'share' | 'save' | null;

// 截图完成后的操作栏：分享给朋友 / 保存到相册 / 关闭。
export function PosterShareActions({ busy, onShare, onSave, onClose }: { busy: ActionBusy; onShare: () => void; onSave: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { bottom: Math.max(insets.bottom, 14) }]}>
      <Pressable
        accessibilityRole="button"
        disabled={busy !== null}
        onPress={onShare}
        style={({ pressed }) => [styles.primaryButton, pressed && busy === null && styles.pressed]}
      >
        {busy === 'share' ? (
          <ActivityIndicator size="small" color="#171611" />
        ) : (
          <Ionicons name="share-social" size={16} color="#171611" />
        )}
        <Text style={styles.primaryText}>分享给朋友</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy !== null}
        onPress={onSave}
        style={({ pressed }) => [styles.secondaryButton, pressed && busy === null && styles.pressed]}
      >
        {busy === 'save' ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
        )}
        <Text style={styles.secondaryText}>保存到相册</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy !== null} onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && busy === null && styles.pressed]}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17,17,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    padding: 8,
  },
  primaryButton: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: '#FFF9EE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { color: '#171611', fontSize: 14, fontWeight: '900' },
  secondaryButton: { flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  closeButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});

export type { ActionBusy };
