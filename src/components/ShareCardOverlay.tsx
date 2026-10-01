import React from 'react';
import { Alert, PixelRatio, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { captureScreen } from 'react-native-view-shot';
import { resolveCardImageSource } from './CardHeaderImage';
import { SharePoster } from './SharePoster';
import { nextFrame, PosterShareActions, releasePosterTmp, sharePosterFile, sleep, usePosterCapture, type ActionBusy } from './PosterShareKit';
import { saveHomeBackgroundImageToDirectory } from '../utils/homeBackground';
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
// fit 模式是兜底：captureRef 失败时退回「等比缩放适配屏幕 + 逐步减少块数」的
// 整屏截图路径，保证分享始终可用。
// 截图完成后弹出操作栏：分享给朋友 / 保存到相册 / 关闭。
const POSTER_MAX_BLOCKS = 30;
const POSTER_MIN_BLOCKS = 3;
const POSTER_LONG_MAX_BLOCKS = 60;
const FIT_SETTLE_TIMEOUT_MS = 3000;
// 长图位图像素高度上限：约 25000 × 屏宽像素 × 4 字节 ≈ 120MB，超出直接走 fit 兜底
const LONG_MAX_POSTER_PIXEL_HEIGHT = 25000;
// fit 模式下为海报内部的品牌栏和边距预留的高度
const FIT_RESERVED_HEIGHT = 70;

export function ShareCardOverlay({ card, settings, onDone }: Props) {
  const { height, width } = useWindowDimensions();
  const [mode, setMode] = React.useState<CaptureMode>('long');
  const [posterSource, setPosterSource] = React.useState<ImageSourcePropType | null>(null);
  const [posterHeight, setPosterHeight] = React.useState(0);
  const [posterMaxBlocks, setPosterMaxBlocks] = React.useState(POSTER_LONG_MAX_BLOCKS);
  const [capturedUri, setCapturedUri] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<ActionBusy>(null);
  const posterImageResolveRef = React.useRef<(() => void) | null>(null);
  const posterSettleResolveRef = React.useRef<(() => void) | null>(null);
  const posterBlocksRef = React.useRef(POSTER_LONG_MAX_BLOCKS);
  const posterHeightRef = React.useRef(0);
  const imageLoadedRef = React.useRef(false);
  const modeRef = React.useRef<CaptureMode>('long');
  const capturedUriRef = React.useRef<string | null>(null);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const { targetRef, capture, kickStyle } = usePosterCapture();
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

  const releaseCaptured = React.useCallback(() => {
    releasePosterTmp(capturedUriRef.current);
    capturedUriRef.current = null;
  }, []);

  const handleShare = React.useCallback(async () => {
    const uri = capturedUriRef.current;
    if (!uri || actionBusy) return;
    setActionBusy('share');
    try {
      await sharePosterFile(uri, '分享知识卡片');
      releaseCaptured();
      onDoneRef.current();
    } catch (error) {
      Alert.alert('分享失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, releaseCaptured]);

  const handleSave = React.useCallback(async () => {
    const uri = capturedUriRef.current;
    if (!uri || actionBusy) return;
    setActionBusy('save');
    try {
      // 与首页壁纸下载共用同一条保存路径（自选目录 / 系统相册），不额外申请权限。
      const savedUri = await saveHomeBackgroundImageToDirectory(uri, settings.homeBackgroundDownloadDirectory);
      releaseCaptured();
      onDoneRef.current();
      Alert.alert('已保存', `分享图已保存到：\n${savedUri}`);
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, releaseCaptured, settings.homeBackgroundDownloadDirectory]);

  const handleClose = React.useCallback(() => {
    releaseCaptured();
    onDoneRef.current();
  }, [releaseCaptured]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      let uri: string | null = null;
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
        if (canAttemptLong) {
          uri = await capture({ screenFallback: false });
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
          uri = await captureScreen({ format: 'png', quality: 1, result: 'tmpfile' }).catch(() => null);
        }

        // 交给 ref 统一管理：卸载时由 cleanup 释放，未生成时提示后关闭。
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
  }, [card.id, settings.cardBackgroundImageUrl, settings.cardImagePoolSize, capture, targetRef]);

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

  return (
    <View style={[styles.overlay, kickStyle]}>
      {mode === 'long' ? (
        // 海报按自然高度全宽渲染（可高于屏幕），截图只针对这个视图。
        <View ref={targetRef} collapsable={false} style={styles.longTarget}>
          {posterElement}
          <PosterFooter />
        </View>
      ) : (
        <View style={{ transform: [{ scale: posterScale }], transformOrigin: '50% 0%' }}>
          {posterElement}
          <PosterFooter />
        </View>
      )}
      {capturedUri ? (
        <PosterShareActions
          busy={actionBusy}
          onShare={() => { void handleShare(); }}
          onSave={() => { void handleSave(); }}
          onClose={handleClose}
        />
      ) : null}
    </View>
  );
}

// 海报底部的品牌栏：随海报一起截进图片。
function PosterFooter() {
  return (
    <View style={styles.posterFooter}>
      <Text style={styles.footerBrand}>Scrollark</Text>
      <Text style={styles.footerNote}>让每一次阅读都有收获</Text>
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
