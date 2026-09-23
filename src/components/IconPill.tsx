import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { palette, radius } from '../theme/tokens';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  onPress?: () => void;
  size?: number;
  light?: boolean;
  style?: ViewStyle;
};

export function IconPill({ name, label, active, onPress, size = 21, light, style }: Props) {
  const color = light ? palette.paper : active ? palette.paper : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, light && styles.light, active && styles.active, pressed && styles.pressed, style]}
    >
      <Ionicons name={name} size={size} color={color} />
      {label ? <Text style={[styles.label, (active || light) && styles.labelLight]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 46,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,249,238,0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  active: {
    backgroundColor: palette.accent,
  },
  light: {
    backgroundColor: 'rgba(17,17,15,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.ink,
  },
  labelLight: {
    color: palette.paper,
  },
});
