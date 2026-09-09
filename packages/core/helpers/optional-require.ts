/**
 * 可选依赖加载：尝试 require 指定包，失败时静默返回空对象（不抛错）。
 *
 * 在框架中的角色：与 loadAdapter 不同，本函数用于“可选”依赖场景，
 * 包未安装不视为致命错误，调用方需自行处理空对象结果。
 * @param packageName - 包名
 * @param loaderFn - 自定义加载函数（可选，优先于 require）
 * @returns 加载到的模块；失败时返回空对象
 */
export function optionalRequire(packageName: string, loaderFn?: Function) {
  try {
    return loaderFn ? loaderFn() : require(packageName);
  } catch (e) {
    return {};
  }
}
