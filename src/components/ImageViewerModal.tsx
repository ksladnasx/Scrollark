import React from 'react';
import { Animated, Modal, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';

// 全屏图片查看器：捏合缩放、双击放大/还原、放大后拖动平移，单击关闭。
// 用 PanResponder + Animated 手势实现，不引入手势库。
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const TAP_TIMEOUT = 260;
const SNAP_BACK_SCALE = 1.12;

type Touch = { pageX: number; pageY: number };

function touchDistance(touches: readonly Touch[]) {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ImageViewerModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const windowDims = useWindowDimensions();
  const dimsRef = React.useRef({ width: 0, height: 0 });
  dimsRef.current = { width: windowDims.width, height: windowDims.height };

  const scale = React.useRef(new Animated.Value(1)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;
  const view = React.useRef({ scale: 1, tx: 0, ty: 0 });
  const gesture = React.useRef({ pinchBase: 0, scaleBase: 1, txBase: 0, tyBase: 0, startX: 0, startY: 0, moved: false, pinched: false, pointers: 0 });
  const lastTapRef = React.useRef(0);
  const tapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!uri) return;
    view.current = { scale: 1, tx: 0, ty: 0 };
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [uri, scale, translateX, translateY]);

  React.useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const applyNow = () => {
    scale.setValue(view.current.scale);
    translateX.setValue(view.current.tx);
    translateY.setValue(view.current.ty);
  };

  const animateTo = (target: { scale: number; tx: number; ty: number }) => {
    view.current = target;
    const config = { friction: 8, tension: 65, useNativeDriver: true } as const;
    Animated.parallel([
      Animated.spring(scale, { toValue: target.scale, ...config }),
      Animated.spring(translateX, { toValue: target.tx, ...config }),
      Animated.spring(translateY, { toValue: target.ty, ...config }),
    ]).start();
  };

  const toggleZoom = () => {
    if (view.current.scale > 1.01) {
      animateTo({ scale: 1, tx: 0, ty: 0 });
    } else {
      animateTo({ scale: DOUBLE_TAP_SCALE, tx: 0, ty: 0 });
    }
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        const g = gesture.current;
        g.moved = false;
        g.pinched = false;
        g.pointers = touches.length;
        if (touches.length >= 2) {
          g.pinchBase = touchDistance(touches);
          g.scaleBase = view.current.scale;
          g.pinched = true;
        } else if (touches[0]) {
          g.txBase = view.current.tx;
          g.tyBase = view.current.ty;
          g.startX = touches[0].pageX;
          g.startY = touches[0].pageY;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        const g = gesture.current;
        const v = view.current;
        if (touches.length >= 2 && g.pinchBase > 0) {
          g.pointers = touches.length;
          g.pinched = true;
          const next = clamp(g.scaleBase * (touchDistance(touches) / g.pinchBase), 1, MAX_SCALE);
          const maxX = ((next - 1) * dimsRef.current.width) / 2;
          const maxY = ((next - 1) * dimsRef.current.height) / 2;
          v.scale = next;
          v.tx = clamp(v.tx, -maxX, maxX);
          v.ty = clamp(v.ty, -maxY, maxY);
          applyNow();
        } else if (touches.length === 1 && touches[0]) {
          if (g.pointers >= 2) {
            // 双指收拢成单指：以当前位移为新基准，避免跳变
            g.pointers = 1;
            g.txBase = v.tx;
            g.tyBase = v.ty;
            g.startX = touches[0].pageX;
            g.startY = touches[0].pageY;
            return;
          }
          const dx = touches[0].pageX - g.startX;
          const dy = touches[0].pageY - g.startY;
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
          if (v.scale > 1.01) {
            const maxX = ((v.scale - 1) * dimsRef.current.width) / 2;
            const maxY = ((v.scale - 1) * dimsRef.current.height) / 2;
            v.tx = clamp(g.txBase + dx, -maxX, maxX);
            v.ty = clamp(g.tyBase + dy, -maxY, maxY);
            applyNow();
          }
        }
      },
      onPanResponderRelease: () => {
        const g = gesture.current;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        if (g.pinched) {
          if (view.current.scale < SNAP_BACK_SCALE) animateTo({ scale: 1, tx: 0, ty: 0 });
          return;
        }
        if (g.moved) return;
        const now = Date.now();
        if (now - lastTapRef.current <= TAP_TIMEOUT) {
          lastTapRef.current = 0;
          toggleZoom();
          return;
        }
        lastTapRef.current = now;
        tapTimerRef.current = setTimeout(() => {
          tapTimerRef.current = null;
          onCloseRef.current();
        }, TAP_TIMEOUT);
      },
      onPanResponderTerminate: () => {
        if (view.current.scale < SNAP_BACK_SCALE) animateTo({ scale: 1, tx: 0, ty: 0 });
      },
    }),
  ).current;

  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onCloseRef.current}>
      <View style={styles.backdrop} {...panResponder.panHandlers}>
        <Animated.Image
          source={uri ? { uri } : undefined}
          style={[styles.image, { transform: [{ translateX }, { translateY }, { scale }] }]}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
