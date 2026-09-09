/**
 * 比较两个数组在指定索引位置的元素是否全等（===）。
 * 用于 subscribeConnectionEvent 中按 client（第 0 位）对流事件去重。
 *
 * @param prev - 上一次事件携带的参数数组。
 * @param curr - 当前事件携带的参数数组。
 * @param index - 要比较的元素索引。
 * @returns 两个数组均存在且指定位置元素全等时为 true。
 */
export function compareElementAt(
  prev: unknown[],
  curr: unknown[],
  index: number,
) {
  return prev && curr && prev[index] === curr[index];
}
