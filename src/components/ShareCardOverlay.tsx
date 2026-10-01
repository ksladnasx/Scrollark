import React from 'react';
import {
  Alert,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { captureRef, captureScreen, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { resolveCardImageSource } from './CardHeaderImage';
import { SharePoster } from './SharePoster';
import type { CardRecord, Settings } from '../domain/types';
import { parseMarkdownBlocks } from '../utils/markdown';

type Props = {
  card: CardRecord;
  settings: Settings;
  onDone: () => void;
};

type CaptureMode = 'long' | 'fit';

// 长图模式（默认）：海报按自然高度、全屏宽渲染（高度可超过屏幕），
// captureRef 只截海报视图本身——输出图宽度固定、高度随内容增长（手机长截图效果）。
// 注意：captureScreen 只能截主窗口里的可见屏幕，无法承载超屏内容，所以长图
// 必须走 captureRef；而 <Modal> 是独立 Dialog 窗口，本组件必须挂在页面/App 层级。
// fit 模式是兜底：captureRef 走 Fabric 的 addUIBlock interop 队列（在下一次提交时
// 执行），在个别设备/架构组合上会失败或挂起——超时或报错时退回「等比缩放适配
// 屏幕 + 逐步减少块数」的整屏截图路径，保证分享始终可用。
const POSTER_MAX_BLOCKS = 30;
const POSTER_MIN_BLOCKS = 3;
const POSTER_LONG_MAX_BLOCKS = 60;
const LONG_CAPTURE_TIMEOUT_MS = 2500;
const FIT_SETTLE_TIMEOUT_MS = 3000;
// 长图位图像素高度上限：约 25000 × 屏宽像素 × 4 字节 ≈ 120MB，超出直接走 fit 兜底
const LONG_MAX_POSTER_PIXEL_HEIGHT = 25000;
// fit 模式下为海报内部的品牌栏和边距预留的高度
const FIT_RESERVED_HEIGHT = 70;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// 海报底部的品牌栏：长图模式下随海报一起截进图片。
function PosterFooter() {
  return (
    <View style={styles.posterFooter}>
      <Text style={styles.footerBrand}>Scrollark</Text>
      <Text style={styles.footerNote}>让每一次阅读都有收获</Text>
    </View>
  );
}

export function ShareCardOverlay({ card, settings, onDone }: Props) {
  const { height, width } = useWindowDimensions();
  const [mode, setMode] = React.useState<CaptureMode>('long');
  const [posterSource, setPosterSource] = React.useState<ImageSourcePropType | null>(null);
  const [posterHeight, setPosterHeight] = React.useState(0);
  const [posterMaxBlocks, setPosterMaxBlocks] = React.useState(POSTER_LONG_MAX_BLOCKS);
  // 截图 kick：captureRef 排队后通过两次小幅状态更新触发 Fabric 提交，
  // 让 interop 队列里的 UI 块得以执行（透明度 0.999 与 1 视觉上无差别）。
  const [captureKick, setCaptureKick] = React.useState(0);
  const posterImageResolveRef = React.useRef<(() => void) | null>(null);
  const posterSettleResolveRef = React.useRef<(() => void) | null>(null);
  const posterBlocksRef = React.useRef(POSTER_LONG_MAX_BLOCKS);
  const posterHeightRef = React.useRef(0);
  const imageLoadedRef = React.useRef(false);
  const modeRef = React.useRef<CaptureMode>('long');
  const targetRef = React.useRef<View | null>(null);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const totalBlocks = React.useMemo(() => parseMarkdownBlocks(card.content).length, [card.content]);

  const availableHeight = Math.max(200, height - FIT_RESERVED_HEIGHT);
  // fit 模式的整体等比缩放兜底（长图模式恒为 1，海报铺满全宽）
  const posterScale = mode === 'fit' && posterHeight > 0 ? Math.min(1, availableHeight / posterHeight) : 1;

  // 长图模式：首次布局即收敛；fit 模式：按高度比例逐步减少块数直到放进屏幕。
  const handlePosterLayout = React.useCallback((h: number) => {
    posterHeightRef.current = h;
    setPosterHeight(h);
    if (h <= 0) return;
    if (modeRef.current === 'long') {
      posterSettleResolveRef.current?.();
      return;
    }
    const shown = Math.min(posterBlocksRef.current, totalBlocks);
    if (h <= availableHeight || shown <= POSTER_MIN_BLOCKS) {
      posterSettleResolveRef.current?.();
      return;
    }
    const next = Math.max(
      POSTER_MIN_BLOCKS,
      Math.min(shown - 1, Math.floor(shown * (availableHeight / h) * 0.92)),
    );
    posterBlocksRef.current = next;
    setPosterMaxBlocks(next);
  }, [availableHeight, totalBlocks]);

  const handleImageLoaded = React.useCallback(() => {
    imageLoadedRef.current = true;
    posterImageResolveRef.current?.();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let uri: string | null = null;
    void (async () => {
      try {
        // 先解析当前实际生效的头图（卡片对象上的字段可能是快照），
        // 解析完成后再挂载海报，避免海报里出现与卡片不一致的兜底图。
        const imageSource = await resolveCardImageSource(
          card.id,
          settings.cardBackgroundImageUrl,
          settings.cardImagePoolSize,
        );
        if (cancelled) return;
        imageLoadedRef.current = false;
        modeRef.current = 'long';
        setMode('long');
        posterBlocksRef.current = POSTER_LONG_MAX_BLOCKS;
        setPosterMaxBlocks(POSTER_LONG_MAX_BLOCKS);
        setPosterHeight(0);
        setPosterSource(imageSource);
        // 等海报完成首次布局且头图真正解码上屏（3 秒超时兜底）后再截图。
        const imageReady = new Promise<void>((resolve) => {
          posterImageResolveRef.current = resolve;
        });
        const layoutDone = new Promise<void>((resolve) => {
          posterSettleResolveRef.current = resolve;
        });
        await nextFrame();
        await Promise.race([Promise.all([imageReady, layoutDone]), sleep(FIT_SETTLE_TIMEOUT_MS)]);
        await sleep(80);
        if (cancelled) return;

        // 长图截图：只截海报视图本身（高度可超过屏幕）。
        const posterPixelHeight = posterHeightRef.current * PixelRatio.get();
        const canAttemptLong =
          targetRef.current !== null &&
          posterPixelHeight > 0 &&
          posterPixelHeight <= LONG_MAX_POSTER_PIXEL_HEIGHT;
        if (canAttemptLong && targetRef.current) {
          // 把 rejection 折叠成结果对象：长图失败不应中断分享流程，而是走兜底。
          const longAttempt = captureRef(targetRef.current, { format: 'png', quality: 1, result: 'tmpfile' }).then(
            (result) => ({ ok: true as const, uri: result }),
            () => ({ ok: false as const }),
          );
          setCaptureKick((k) => k + 1);
          await nextFrame();
          await nextFrame();
          setCaptureKick((k) => k + 1);
          const raced = await Promise.race([
            longAttempt,
            sleep(LONG_CAPTURE_TIMEOUT_MS).then(() => null),
          ]);
          if (raced && raced.ok) {
            uri = raced.uri;
          } else if (raced === null) {
            // 超时：迟到的长图结果直接丢弃，避免临时文件泄漏。
            void longAttempt.then((late) => {
              if (late.ok) releaseCapture(late.uri);
            });
          }
        }

        if (cancelled) return;

        if (!uri) {
          // fit 兜底：等比缩放适配屏幕 + 减少块数，然后整屏截图。
          modeRef.current = 'fit';
          setMode('fit');
          posterBlocksRef.current = POSTER_MAX_BLOCKS;
          setPosterMaxBlocks(POSTER_MAX_BLOCKS);
          setPosterHeight(0);
          const fitLayout = new Promise<void>((resolve) => {
            posterSettleResolveRef.current = resolve;
          });
          const imageWait = imageLoadedRef.current
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                posterImageResolveRef.current = resolve;
              });
          await nextFrame();
          await Promise.race([Promise.all([fitLayout, imageWait]), sleep(FIT_SETTLE_TIMEOUT_MS)]);
          await sleep(80);
          if (cancelled) return;
          uri = await captureScreen({ format: 'png', quality: 1, result: 'tmpfile' });
        }

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert('无法分享', '当前设备不支持系统分享。');
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '分享知识卡片' });
      } catch (error) {
        Alert.alert('分享失败', error instanceof Error ? error.message : '请稍后再试');
      } finally {
        posterImageResolveRef.current = null;
        posterSettleResolveRef.current = null;
        if (uri) {
          try {
            releaseCapture(uri);
          } catch {
            // 临时文件清理失败不影响分享结果。
          }
        }
        if (!cancelled) onDoneRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card.id, settings.cardBackgroundImageUrl, settings.cardImagePoolSize]);

  if (!posterSource) return null;

  const posterElement = (
    <SharePoster
      card={card}
      settings={settings}
      width={width}
      imageSource={posterSource}
      maxBlocks={posterMaxBlocks}
      onLayout={handlePosterLayout}
      onImageLoaded={handleImageLoaded}
    />
  );

  if (mode === 'long') {
    return (
      <View style={[styles.overlay, captureKick % 2 === 1 && styles.overlayKick]}>
        {/* 海报按自然高度全宽渲染（可高于屏幕），截图只针对这个视图。 */}
        <View ref={targetRef} collapsable={false} style={styles.longTarget}>
          {posterElement}
          <PosterFooter />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={{ transform: [{ scale: posterScale }], transformOrigin: '50% 0%' }}>
        {posterElement}
        <PosterFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF9EE',
    zIndex: 100,
  },
  overlayKick: { opacity: 0.999 },
  longTarget: {
    backgroundColor: '#FFF9EE',
  },
  posterFooter: {
    marginTop: 6,
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DED2BE',
  },
  footerBrand: { fontSize: 14, fontWeight: '900', color: '#11110F', letterSpacing: 0.5 },
  footerNote: { fontSize: 11, fontWeight: '700', color: '#6E6A5E' },
});
