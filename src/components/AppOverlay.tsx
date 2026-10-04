import React from 'react';

// 页面层级浮层的「传送门」：Tab 页里的编辑浮层（文档 / 分组 / 手写卡 / 批注）
// 需要盖住 App 根部悬浮的 Tab 栏，但 React Native 没有跨层挂载能力——
// 页面内的普通 View 永远画不过根部的 TabBar。这里用模块级插槽：
// 页面把自己的浮层节点登记进来，由挂载在 App 根部（TabBar 之后）的
// <OverlayHost /> 代为渲染，保证层级永远在 TabBar 之上。
type SlotRender = () => React.ReactNode;

const slots = new Map<string, SlotRender>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// render 传 null 表示注销该插槽。重复设置同一 id 会覆盖旧内容。
export function setOverlaySlot(id: string, render: SlotRender | null) {
  if (render) slots.set(id, render);
  else slots.delete(id);
  notify();
}

export function OverlayHost() {
  const [, forceUpdate] = React.useReducer((count: number) => count + 1, 0);

  React.useEffect(() => {
    const listener = () => forceUpdate();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (slots.size === 0) return null;
  return (
    <>
      {[...slots.entries()].map(([id, render]) => (
        <React.Fragment key={id}>{render()}</React.Fragment>
      ))}
    </>
  );
}
