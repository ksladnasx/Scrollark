import type { TextStyle } from 'react-native';

// Android 的 RN 字体管理器在解析「自定义 fontFamily + fontWeight>=700」时会查找
// fonts/<Family>_bold 资产，找不到便用 Typeface.create(<Family>, BOLD) 按系统字体族
// 解析，整段文字直接回退 Roboto Bold，用户选择的字体完全丢失（expo-font 只以
// NORMAL 字重注册字体）。内置中文字体均为单字重，无法提供 bold 变体，因此
// 使用自定义字体的文本统一把字重压到 600：Android 会按 NORMAL 解析出正确字体，
// iOS 在单字重字体上也只会取到唯一的字面。加粗观感改由 boldTextStyles 的
// 同色 textShadow 描边模拟。
export const CUSTOM_FONT_BOLD_WEIGHT = '600';

// fontFamily 为空（走系统字体）时不做处理，保留原生 bold 渲染。
export function boldTextStyles(fontFamily: string | undefined, color: string): TextStyle {
  if (!fontFamily) return {};
  return {
    fontWeight: CUSTOM_FONT_BOLD_WEIGHT,
    textShadowColor: color,
    textShadowOffset: { width: 0.4, height: 0.4 },
    textShadowRadius: 0.6,
  };
}
