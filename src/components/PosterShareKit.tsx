import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef, captureScreen, releaseCapture } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius } from '../theme/tokens';
import { saveHomeBackgroundImageToDirectory } from '../utils/homeBackground';

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

// 操作栏的底部间距：分享浮层挂在 App 层、遮罩已盖住悬浮 Tab 栏，
// 因此只需少量抬升（避开手势区 + 稍微浮在遮罩上方），不必完全避开 Tab 栏高度。
const TAB_BAR_CLEARANCE = 36;

// 截图完成后的操作栏：分享给朋友 / 保存到相册 / 取消（红色实心，醒目易点）。
export function PosterShareActions({ busy, onShare, onSave, onClose }: { busy: ActionBusy; onShare: () => void; onSave: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { bottom: Math.max(insets.bottom, 14) + TAB_BAR_CLEARANCE }]}>
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
        <Text style={styles.primaryText}>分享</Text>
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
        <Text style={styles.secondaryText}>保存</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy !== null} onPress={onClose} style={({ pressed }) => [styles.cancelButton, pressed && busy === null && styles.pressed]}>
        <Ionicons name="close" size={15} color="#FFFFFF" />
        <Text style={styles.cancelText}>取消</Text>
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
  cancelButton: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: '#C0564A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  cancelText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});

export type { ActionBusy };

const CAPTURE_SETTLE_TIMEOUT_MS = 3000;

// 海报分享通用流程：等 settle（布局 / 背景图就绪）→ 截图 → 操作栏（分享 / 保存 / 取消）。
// settle 由调用方用 Promise.all([...]) 组出（必须用 useMemo 保持引用稳定）；3 秒超时兜底直接截图。
export function usePosterShare(options: { title: string; saveDirectory: string; onDone: () => void; settle: Promise<unknown> }) {
  const { title, saveDirectory, onDone, settle } = options;
  const [capturedUri, setCapturedUri] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<ActionBusy>(null);
  const capturedUriRef = React.useRef<string | null>(null);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const { targetRef, capture, kickStyle } = usePosterCapture();

  const releaseCaptured = React.useCallback(() => {
    releasePosterTmp(capturedUriRef.current);
    capturedUriRef.current = null;
  }, []);

  const handleClose = React.useCallback(() => {
    releaseCaptured();
    onDoneRef.current();
  }, [releaseCaptured]);

  const handleShare = React.useCallback(async () => {
    const uri = capturedUriRef.current;
    if (!uri || actionBusy) return;
    setActionBusy('share');
    try {
      await sharePosterFile(uri, title);
      releaseCaptured();
      onDoneRef.current();
    } catch (error) {
      Alert.alert('分享失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, releaseCaptured, title]);

  const handleSave = React.useCallback(async () => {
    const uri = capturedUriRef.current;
    if (!uri || actionBusy) return;
    setActionBusy('save');
    try {
      // 与首页壁纸下载共用同一条保存路径（自选目录 / 系统相册），不额外申请权限。
      const savedUri = await saveHomeBackgroundImageToDirectory(uri, saveDirectory);
      releaseCaptured();
      onDoneRef.current();
      Alert.alert('已保存', `分享图已保存到：\n${savedUri}`);
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, releaseCaptured, saveDirectory]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await nextFrame();
        await Promise.race([settle, sleep(CAPTURE_SETTLE_TIMEOUT_MS)]);
        await sleep(80);
        if (cancelled) return;
        const uri = await capture({ screenFallback: false });
        capturedUriRef.current = uri;
        if (cancelled) return;
        if (!uri) {
          Alert.alert('生成分享图失败', '请稍后再试。');
          onDoneRef.current();
          return;
        }
        setCapturedUri(uri);
      } catch (error) {
        Alert.alert('生成分享图失败', error instanceof Error ? error.message : '请稍后再试');
        onDoneRef.current();
      }
    })();
    return () => {
      cancelled = true;
      releasePosterTmp(capturedUriRef.current);
      capturedUriRef.current = null;
    };
  }, [capture, settle]);

  return { targetRef, kickStyle, capturedUri, actionBusy, handleShare, handleSave, handleClose };
}
