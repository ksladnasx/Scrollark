export const appFonts = {
  LXGWWenKai: require('../../fonts/LXGWWENKAI-REGULAR.ttf'),
  SourceHanSerif: require('../../fonts/SourceHanSerifCN-Regular.otf'),
  HYPixel: require('../../fonts/HYPixel9pxJ-2.ttf'),
  HanYiKaiTi: require('../../fonts/HanYiKaiTiJian-1.ttf'),
  YuanYuanRuanTang: require('../../fonts/AaKeAiBeiTianTianQuanZhuLiao-2.ttf'),
};

// key 同时是 expo-font 的注册名与 settings.fontFamily 的持久化取值，
// 换字体文件时保持 key 不变即可让老用户设置无缝生效。
export const fontOptions = [
  { key: 'LXGWWenKai', label: '霞鹜文楷' },
  { key: 'SourceHanSerif', label: '思源宋体' },
  { key: 'HanYiKaiTi', label: '汉仪楷体' },
  { key: 'HYPixel', label: '汉仪像素' },
  { key: 'YuanYuanRuanTang', label: '方软糖体' },
] as const;

export type FontKey = (typeof fontOptions)[number]['key'];
