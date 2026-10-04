import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { softIcon } from '../theme/assets';

// 入场动画每次 JS 进程只播一次：App 从「加载中」分支切到主树时会重新挂载本组件，
// 用进程级标记让重挂载直接呈现静止的完整画面，避免入场动画重播造成闪烁。
let entrancePlayed = false;

type Props = {
  // enter = 冷启动入场动画 + 底部加载点；exit = 静止画面整体淡出，结束后回调 onDone。
  mode: 'enter' | 'exit';
  onReady?: () => void;
  onDone?: () => void;
};

const ICON_SIZE = 116;

// 开屏页：应用图标（带一圈扩散光环）+ 品牌字与标语依次浮现，
// 底部三颗圆点呼吸表示加载中；应用就绪后整层淡出交还给主界面。
export function SplashScreen({ mode, onReady, onDone }: Props) {
  const theme = useAppTheme();
  const playEntrance = mode === 'enter' && !entrancePlayed;

  // 入场各值：重挂载（exit 阶段）时直接取终态，保证两个阶段画面无缝衔接。
  const iconOpacity = React.useRef(new Animated.Value(1)).current;
  const iconScale = React.useRef(new Animated.Value(playEntrance ? 0.86 : 1)).current;
  const haloScale = React.useRef(new Animated.Value(playEntrance ? 0.9 : 1.5)).current;
  const haloOpacity = React.useRef(new Animated.Value(playEntrance ? 0.45 : 0)).current;
  const textProgress = React.useRef(new Animated.Value(playEntrance ? 0 : 1)).current;
  const overlayOpacity = React.useRef(new Animated.Value(1)).current;
  const readySentRef = React.useRef(false);
  const dots = [
    React.useRef(new Animated.Value(0.3)).current,
    React.useRef(new Animated.Value(0.3)).current,
    React.useRef(new Animated.Value(0.3)).current,
  ];

  React.useEffect(() => {
    if (!playEntrance) return;
    entrancePlayed = true;
    const animations = Animated.parallel([
      Animated.timing(iconScale, { toValue: 1, duration: 560, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      // 光环：图标落定后从图标边缘向外扩散一圈，随后消失（一次性）。
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(haloScale, { toValue: 1.5, duration: 880, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0, duration: 880, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      // 文字与标语：单值驱动，用插值区间错开两者的浮现时机。
      Animated.timing(textProgress, { toValue: 1, duration: 760, delay: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    animations.start();
    return () => animations.stop();
  }, [playEntrance, iconScale, haloScale, haloOpacity, textProgress]);

  // 底部加载点：三颗错峰呼吸，enter/exit 两阶段都保持，随整层一起淡出。
  React.useEffect(() => {
    const loop = (dot: Animated.Value) => Animated.loop(Animated.sequence([
      Animated.timing(dot, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0.3, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    const animations = Animated.stagger(170, dots.map(loop));
    animations.start();
    return () => animations.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exiting = mode === 'exit';
  React.useEffect(() => {
    if (!exiting) return;
    const animation = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 340,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => animation.stop();
  }, [exiting, overlayOpacity, onDone]);

  const wordOpacity = textProgress.interpolate({ inputRange: [0, 0.55], outputRange: [0, 1], extrapolate: 'clamp' });
  const wordTranslateY = textProgress.interpolate({ inputRange: [0, 0.75], outputRange: [16, 0], extrapolate: 'clamp' });
  const tagOpacity = textProgress.interpolate({ inputRange: [0.35, 0.95], outputRange: [0, 1], extrapolate: 'clamp' });
  const tagTranslateY = textProgress.interpolate({ inputRange: [0.35, 1], outputRange: [10, 0], extrapolate: 'clamp' });

  const handleLayout = React.useCallback(() => {
    if (readySentRef.current) return;
    readySentRef.current = true;
    onReady?.();
  }, [onReady]);

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: theme.paper, opacity: overlayOpacity }]}
      pointerEvents={exiting ? 'none' : 'auto'}
      onLayout={handleLayout}
    >
      <View style={styles.brand}>
        <View style={styles.iconSlot}>
          <Animated.View
            style={[styles.halo, { borderColor: theme.accentSoft, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
          <Animated.Image
            source={softIcon}
            accessibilityLabel="Scrollark 应用图标"
            style={[styles.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
          />
        </View>
        <Animated.Text
          style={[styles.wordmark, { color: theme.ink, opacity: wordOpacity, transform: [{ translateY: wordTranslateY }] }]}
        >
          Scrollark
        </Animated.Text>
        <Animated.View style={[styles.taglinePill, { borderColor: theme.line, opacity: tagOpacity, transform: [{ translateY: tagTranslateY }] }]}>
          <Text style={[styles.taglineText, { color: theme.inkMuted }]}>让每一次阅读都有收获</Text>
        </Animated.View>
      </View>
      <View style={styles.dotsRow} pointerEvents="none">
        {dots.map((dot, index) => (
          <Animated.View key={index} style={[styles.dot, { backgroundColor: theme.inkMuted, opacity: dot }]} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
  },
  iconSlot: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  halo: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1.5,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 30,
  },
  wordmark: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  taglinePill: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  taglineText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 72,
    flexDirection: 'row',
    gap: 9,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
