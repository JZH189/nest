import { ContextId } from './instance-wrapper';

/** controller 实例唯一 ID 挂载在 controller 类上的属性名（不可枚举） */
export const CONTROLLER_ID_KEY = 'CONTROLLER_ID';

/** 静态上下文的固定 ID（单例实例始终存放在该上下文下） */
const STATIC_CONTEXT_ID = 1;
/**
 * 静态上下文标识：与请求上下文相对，
 * 所有单例（DEFAULT 作用域）实例都缓存在 STATIC_CONTEXT 键下。
 */
export const STATIC_CONTEXT: ContextId = Object.freeze({
  id: STATIC_CONTEXT_ID,
});
