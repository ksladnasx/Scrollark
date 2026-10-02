import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import React from 'react';

type Props = {
  size: number;
  strokeWidth: number;
  // 进度 0..1；内部会做钳制。
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
};

// iOS 学习 App 风格的环形进度：背景轨道 + 圆角描边 + 进场动画，中心留给关键数字。
export function RingProgress({ size, strokeWidth, progress, color, trackColor, children }: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = React.useRef(new Animated.Value(0)).current;
  // createAnimatedComponent 只能调用一次，用 ref 缓存避免每次渲染重建。
  const AnimatedCircle = React.useMemo(() => Animated.createAnimatedComponent(Circle), []);

  React.useEffect(() => {
    Animated.timing(value, {
      toValue: clamped,
      duration: 650,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [clamped, value]);

  const dashOffset = value.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
