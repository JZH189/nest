/**
 * 原样重新抛出传入的错误。
 *
 * 在框架中的角色：常用作 Promise/Catch 回调（如 .catch(rethrow)），
 * 用于在不做任何处理的情况下恢复异常传播链（例如在错误监听器中
 * 保持默认行为）。
 * @param err - 要重新抛出的错误对象
 */
export const rethrow = (err: unknown) => {
  throw err;
};
