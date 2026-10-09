// 交互期的瞬时标志（不进入 React 状态，避免无谓重渲染）

let _transforming = false

/** 正在使用变换手柄拖拽时为 true，用于抑制"点击空白取消选中" */
export function setTransforming(v: boolean) {
  _transforming = v
}

export function isTransforming(): boolean {
  return _transforming
}
