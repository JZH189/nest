/**
 * 清理字符串中的空白符与换行符（测试辅助工具，用于在断言前规范化多行字符串）。
 *
 * @param str 待清理的原始字符串，允许为空
 * @returns 移除所有空白符和换行符后的字符串；若入参为空值则原样返回
 */
export function stringCleaner(str: string) {
  return str ? str.replace(/\s+/g, '').replace(/\n+/g, '') : str;
}
