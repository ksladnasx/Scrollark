import type { Route } from '../domain/types';

// 路由结构化判等：代替 JSON.stringify（键序无关、忽略值为 undefined 的字段）。
// 同名路由按各自的参数字段逐一比较；将来迁移 react-navigation 时只需替换这一处。
export function routeEquals(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  switch (a.name) {
    case 'tabs':
      return b.name === 'tabs' && a.tab === b.tab;
    case 'session':
      return b.name === 'session' && (a.startCardId ?? undefined) === (b.startCardId ?? undefined);
    case 'review':
      return b.name === 'review' && (a.mode ?? undefined) === (b.mode ?? undefined);
    case 'sessionEnd':
      // 总结对象只在 onEnd 时创建一次，路由存活期内引用不变，比较引用即可。
      return b.name === 'sessionEnd' && a.summary === b.summary;
    case 'search':
      return b.name === 'search';
    case 'settingsDetail':
      // tab 记录推入来源（二级页叠加在 Tab 层之上展示），需一并比较。
      return b.name === 'settingsDetail' && a.section === b.section && a.tab === b.tab;
    case 'favorites':
      // 收藏与批注二级页：tab 记录推入来源，需一并比较。
      return b.name === 'favorites' && a.tab === b.tab;
    default:
      return false;
  }
}
